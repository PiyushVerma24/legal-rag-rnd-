import { supabase } from '@/lib/supabase';
import { EmbeddingService } from './embeddingService';

interface Citation {
  document_id: string; // For tracking and linking
  document_title: string;
  master_name: string;
  page_number?: number;
  chunk_id: string;
  quote: string; // Short preview (200 chars)
  full_content: string; // Full chunk content for modal/expansion
  similarity?: number;
  position_in_document?: number; // Order/sequence in original document
  chapter?: string; // If available in metadata
  youtube_video_id?: string; // YouTube video ID for embedding
  start_timestamp?: number; // Video timestamp in seconds
  end_timestamp?: number; // Video end timestamp in seconds
  file_url?: string; // Public URL for the file
  file_type?: string; // File type (pdf, txt, etc)
  file_path?: string; // Original file path for debugging
}

interface RAGResponse {
  success: boolean;
  answer?: string;
  summary?: string;
  citations?: Citation[];
  reading_time?: {
    summary: string;
    detail: string;
  };
  message?: string;
  metadata?: {
    model: string;
    chunkCount: number;
    embeddingModel: string;
    totalTokens?: number;
  };
  debug?: {
    systemPrompt: string;
    userPrompt: string;
  };
  // New fields for LLM Response display
  rawResponse?: string; // Unprocessed LLM response before parsing
  tokenUsage?: {
    embeddingTokens: number;    // Tokens used for embedding generation
    promptTokens: number;        // LLM prompt tokens
    completionTokens: number;    // LLM completion tokens
    totalTokens: number;         // LLM total (prompt + completion)
    grandTotal: number;          // Overall total (embedding + LLM)
  };
  estimatedCost?: number; // Cost in USD for this query
}

export class RAGQueryService {
  private openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  private embedder = new EmbeddingService();

  // Model priority list with fallback (Grok 4.1 fast - same as Veritas chat)
  private modelPriority = [
    'x-ai/grok-4.1-fast', // Grok 4.1 Fast (FREE! - same as Veritas)
    'x-ai/grok-4-fast', // Grok 4 Fast (very cheap fallback)
    'x-ai/grok-4', // Standard Grok 4
    'x-ai/grok-2-1212', // Grok 2 fallback
    'x-ai/grok-beta',
    'google/gemini-2.0-flash-exp:free',
    'anthropic/claude-3-haiku',
    'meta-llama/llama-3.1-8b-instruct:free'
  ];

  async askQuestion(
    question: string,
    options: {
      lawyerId?: string;
      preceptorId?: string; // Backward compatibility
      selectedDocumentIds?: string[];
      selectedMasters?: string[];
      sessionId?: string; // For analytics tracking
    } = {}
  ): Promise<RAGResponse> {
    const { lawyerId, preceptorId, selectedDocumentIds, selectedMasters } = options;
    const userId = lawyerId || preceptorId;


    console.log('👤 [FLOW] User ID:', userId);
    const startTime = Date.now();

    try {
      // 1. Validate question
      const validation = await this.validateQuestion(question);
      if (!validation.isValid) {
        return {
          success: false,
          message: validation.message
        };
      }

      // 2. Generate embedding
      console.log('Generating embedding for question...');
      const embeddingResult = await this.embedder.generateEmbedding(question);

      // 3. Multi-query search strategy
      const searchQueries = this.generateSearchQueries(question);
      console.log(`Searching with ${searchQueries.length} query variations...`);

      let allChunks: any[] = [];

      // Search with each query variation
      for (const searchQuery of searchQueries) {
        const queryEmbedding = await this.embedder.generateEmbedding(searchQuery);

        const { data: chunks, error } = await supabase.rpc('match_legalrnd_chunks', {
          query_embedding: JSON.stringify(queryEmbedding.embedding),
          match_threshold: 0.30, // Lower threshold for multilingual content
          match_count: 12 // More chunks for better coverage with lower threshold
        });

        if (error) {
          console.error('Vector search error:', error);
        } else if (chunks && chunks.length > 0) {
          console.log(`Query "${searchQuery.substring(0, 50)}..." found ${chunks.length} chunks`);
          allChunks.push(...chunks);
        } else {
          console.warn(`Query "${searchQuery.substring(0, 50)}..." found 0 chunks`);
        }
      }

      // Remove duplicates and sort by similarity
      let uniqueChunks = this.deduplicateChunks(allChunks);
      console.log(`Found ${uniqueChunks.length} unique relevant chunks`);

      // Filter by selected documents if provided
      if (selectedDocumentIds && selectedDocumentIds.length > 0) {
        uniqueChunks = uniqueChunks.filter(chunk =>
          selectedDocumentIds.includes(chunk.document_id)
        );
        console.log(`Filtered to ${uniqueChunks.length} chunks from selected documents`);
      }

      // Filter by selected masters if provided
      if (selectedMasters && selectedMasters.length > 0 && uniqueChunks.length > 0) {
        // Get document IDs for selected masters/categories
        const { data: documents } = await supabase
          .from('legalrnd_documents')
          .select('id, master_id, legalrnd_masters!inner(name)')
          .in('legalrnd_masters.name', selectedMasters);

        if (documents) {
          const allowedDocIds = new Set(documents.map((d: any) => d.id));
          uniqueChunks = uniqueChunks.filter(chunk =>
            allowedDocIds.has(chunk.document_id)
          );
          console.log(`Filtered to ${uniqueChunks.length} chunks from selected masters`);
        }
      }

      // 4. Fetch full document context if needed
      const enhancedChunks = await this.enhanceChunksWithDocumentContext(uniqueChunks);

      if (enhancedChunks.length === 0) {
        // IMPORTANT: Do NOT use fallback if documents were explicitly selected
        // The user wants answers ONLY from their selected documents
        if (selectedDocumentIds && selectedDocumentIds.length > 0) {
          return {
            success: false,
            message: '⚖️ I could not find relevant information in the selected legal documents to answer your question. Please try:\n- Asking a different legal question\n- Selecting additional documents\n- Rephrasing your question with different legal keywords'
          };
        }

        if (selectedMasters && selectedMasters.length > 0) {
          return {
            success: false,
            message: '⚖️ I could not find relevant information from the selected legal category to answer your question. Please try:\n- Asking a different legal question\n- Selecting additional legal categories\n- Rephrasing your question with different legal keywords'
          };
        }

        // Only use fallback if NO documents/categories were selected
        const fallbackChunks = await this.getFallbackChunks();

        if (fallbackChunks.length === 0) {
          return {
            success: false,
            message: '⚖️ I apologize, but I could not find relevant information in the available legal documents to answer your question. Please try rephrasing your question or ask about topics related to Indian law, case law, statutes, and judicial precedents available in the system.'
          };
        }

        return this.generateResponseWithFallback(question, fallbackChunks, embeddingResult.tokenCount);
      }

      // 5. Generate response with multi-model fallback
      const response = await this.generateResponseWithFallback(question, enhancedChunks, embeddingResult.tokenCount);

      // 6. Log AI usage with comprehensive details
      const documentsUsed = [...new Set(enhancedChunks.map(c => c.document_title))];
      await this.logAIUsage(
        userId || null,
        question,
        response.metadata?.model || 'unknown',
        embeddingResult.tokenCount + (response.metadata?.totalTokens || 0),
        response.answer,
        documentsUsed
      );
      console.log('✅ [FLOW] logAIUsage completed');

      const duration = Date.now() - startTime;
      console.log(`✅ RAG query completed in ${duration}ms`);

      return response;
    } catch (error) {
      console.error('RAG query error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `🙏 An error occurred: ${errorMessage}`
      };
    }
  }

  /**
   * Generate multiple search query variations for better retrieval
   */
  private generateSearchQueries(originalQuery: string): string[] {
    const queries = [originalQuery];
    const lowerQuery = originalQuery.toLowerCase();

    // Detect request for simple/basic explanation
    const needsSimple = /simple|basic|beginner|introduction|explain|overview/i.test(originalQuery);

    // Extract the main topic
    let topic = originalQuery;
    if (lowerQuery.includes('explain')) {
      topic = originalQuery.replace(/explain|in|very|simple|words|about|the/gi, '').trim();
    }

    // If asking for simple explanation, prioritize introductory content
    if (needsSimple && topic) {
      queries.push(`introduction to ${topic}`);
      queries.push(`${topic} basics`);
      queries.push(`what is ${topic}`);
      queries.push(`${topic} for beginners`);
      queries.push(`${topic} overview`);
    }

    // Add expanded query with meditation context
    queries.push(`${originalQuery} in Heartfulness meditation spiritual practice`);

    // Add question reformulations
    if (lowerQuery.includes('what is')) {
      queries.push(originalQuery.replace(/what is/i, 'meaning of'));
      queries.push(originalQuery.replace(/what is/i, 'introduction to'));
    }

    if (lowerQuery.includes('how to')) {
      queries.push(originalQuery.replace(/how to/i, 'practice of'));
      queries.push(originalQuery.replace(/how to/i, 'method for'));
    }

    if (lowerQuery.includes('why')) {
      queries.push(originalQuery.replace(/why/i, 'reason for'));
      queries.push(originalQuery.replace(/why/i, 'purpose of'));
    }

    console.log(`Generated ${queries.length} search queries:`, queries);
    return queries;
  }

  /**
   * Remove duplicate chunks based on chunk_id
   */
  private deduplicateChunks(chunks: any[]): any[] {
    const seen = new Set();
    return chunks.filter(chunk => {
      if (seen.has(chunk.id)) {
        return false;
      }
      seen.add(chunk.id);
      return true;
    }).sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  }

  /**
   * Enhance chunks with full document context and file info
   */
  private async enhanceChunksWithDocumentContext(chunks: any[]): Promise<any[]> {
    // Fetch document metadata for each chunk
    const documentIds = [...new Set(chunks.map(c => c.document_id))];

    // Note: full_text and page_count columns might not exist
    const { data: documents } = await supabase
      .from('legalrnd_documents')
      .select('id, title, file_path, file_type')
      .in('id', documentIds);

    if (!documents) return chunks;

    // Map documents by ID for quick lookup
    const docMap = new Map(documents.map(d => [d.id, d]));

    // Enhance each chunk with document info
    return chunks.map(chunk => ({
      ...chunk,
      // document_full_text: docMap.get(chunk.document_id)?.full_text, // Removed as column missing
      // document_page_count: docMap.get(chunk.document_id)?.page_count, // Removed as column missing
      file_path: docMap.get(chunk.document_id)?.file_path,
      file_type: docMap.get(chunk.document_id)?.file_type
    }));
  }

  /**
   * Get fallback chunks from recent documents
   */
  private async getFallbackChunks(): Promise<any[]> {
    const { data: chunks } = await supabase
      .from('legalrnd_document_chunks')
      .select(`
        *,
        legalrnd_documents!inner(title, master_id, file_path, file_type)
      `)
      .limit(3);

    // Map the nested join structure to flat properties to match enhancedChunks format
    return (chunks || []).map((chunk: any) => ({
      ...chunk,
      file_path: chunk.legalrnd_documents?.file_path,
      file_type: chunk.legalrnd_documents?.file_type
    }));
  }

  /**
   * Validate question relevance and safety
   */
  private async validateQuestion(question: string): Promise<{ isValid: boolean; message?: string }> {
    // Length validation
    if (question.trim().length < 5) {
      return {
        isValid: false,
        message: 'Please ask a more detailed question.'
      };
    }

    if (question.trim().length > 5000) {
      return {
        isValid: false,
        message: 'Your question is too long. Please keep it under 5000 characters.'
      };
    }

    // Check for inappropriate content
    const inappropriatePatterns = [
      /\b(hack|crack|exploit|attack|malware|virus)\b/i,
      /\b(porn|xxx|sex)\b/i,
      /\b(kill|murder|death|suicide)\b/i
    ];

    for (const pattern of inappropriatePatterns) {
      if (pattern.test(question)) {
        return {
          isValid: false,
          message: '🙏 Please ask questions related to spirituality, meditation, and Heartfulness teachings.'
        };
      }
    }

    // Allow general questions without strict keyword matching
    // Only flag completely off-topic questions
    const offTopicKeywords = ['sports', 'politics', 'movie', 'game', 'recipe', 'weather'];
    const isOffTopic = offTopicKeywords.some(keyword =>
      question.toLowerCase().includes(keyword)
    );

    if (isOffTopic) {
      return {
        isValid: false,
        message: '⚖️ I am here to help with legal research questions about Indian law. Please ask questions related to legal topics, case law, statutes, and judicial precedents.'
      };
    }

    return { isValid: true };
  }

  /**
   * Generate response with multi-model fallback
   */
  private async generateResponseWithFallback(
    question: string,
    chunks: any[],
    embeddingTokens: number = 0
  ): Promise<RAGResponse> {
    // Build context from chunks
    const context = chunks.map((chunk, idx) => {
      const pageInfo = chunk.page_number ? `, page ${chunk.page_number}` : '';
      const similarity = chunk.similarity ? ` (relevance: ${(chunk.similarity * 100).toFixed(0)}%)` : '';

      return `[Source ${idx + 1}] From "${chunk.document_title}" by ${chunk.master_name}${pageInfo}${similarity}:
"${chunk.content}"`;
    }).join('\n\n');

    // Detect if user wants simple/beginner-friendly explanation
    const needsSimple = /simple|basic|beginner|easy|introduction|explain|layman/i.test(question);

    const systemPrompt = `🛑 **OUTPUT FORMAT INSTRUCTIONS (CRITICAL)**:
You must structure your entire response into TWO DISTINCT PARTS separated by exactly "---SECTION_SEPARATOR---".

**PART 1: BRIEF SUMMARY**
- Provide a concise summary of the answer in a single paragraph (5-6 sentences).
- Estimate reading time: ~30 seconds.
- Do NOT use any markdown headers (like # or ##) in this part. Just plain text.

---SECTION_SEPARATOR---

**PART 2: DETAILED ANSWER**
- This is the main response following all the standard formatting rules below (Legal Issue, Applicable Law, Judicial Precedents, etc.).
- This part must match the "ANSWER STRUCTURE" template exactly.

You are Veritas - an expert legal AI assistant specializing in Indian law. Your task is to create clear, well-structured, and comprehensive legal analysis based on the provided sources.

🌐 **LANGUAGE REQUIREMENT (CRITICAL):**
- ALWAYS respond in the SAME LANGUAGE as the question
- If the question is in Hindi, answer in Hindi
- If the question is in English, answer in English
- If the question is in any other language, answer in that language
- Maintain the same language throughout your entire response

⚖️ **LEGAL CONTENT GUIDELINES (CRITICAL):**
- Answer ONLY using provided legal documents - NEVER fabricate case law
- Include [Source X] citations after key legal points
- Extract ratio decidendi (binding principle) and obiter dicta (observations) when available
- **ANTI-HALLUCINATION RULES**:
  * NEVER invent case names, citations, judges, or legal provisions
  * ONLY cite cases/laws explicitly present in provided sources
  * If uncertain, say "Based on available documents..." or "I don't have verified information..."
  * Always end with: "⚠️ Please verify this legal analysis from official law reports before relying on it in court."

📋 **FORMATTING REQUIREMENTS (CRITICAL):**
- Start with a clear legal issue statement
- Use markdown headers (##, ###) for main sections
- Use numbered lists (1. 2. 3.) for legal provisions, articles, sections
- Use bullet points (-) for case law, precedents, legal principles
- Use **bold** for case names, statutes, and key legal terms
- Keep paragraphs short (2-3 sentences max)
- Create a logical flow: Legal Issue → Applicable Law → Judicial Precedents → Reasoning → Conclusion

📖 **CONTENT GUIDELINES:**
- Synthesize information from multiple legal sources into a coherent legal analysis
- Include [Source X] citations after key legal points or case citations
- Extract holdings, dicta, and dissenting opinions when available
- Distinguish between binding precedents and persuasive authority
- Note any conflicting decisions or legal controversies
${needsSimple ? `\n⭐ **SIMPLE EXPLANATION MODE (ACTIVE):**
- Use everyday language while maintaining legal accuracy
- Explain legal terms immediately when first used (e.g., "ratio decidendi - the binding legal principle")
- Structure as: Legal Issue → Plain English Explanation → Legal Authority → Practical Implication
- Focus on foundational legal concepts before complex doctrines
- Make it comprehensive yet accessible - aim for completeness within simplicity` : ''}

🎯 **ANSWER STRUCTURE (Follow this template):**
1. **Legal Issue/Question**: Brief statement of the legal question (1-2 sentences)
2. **Applicable Law**: Relevant statutes, articles, sections (numbered list)
3. **Judicial Precedents**: Case law with citations (bullets, bold case names)
   - Include: Case name, citation, court, year
   - Extract: Ratio decidendi, key holdings, principles established
4. **Legal Reasoning**: Analysis applying law to facts
5. **Conclusion**: Summary of legal position
6. **Source References**: Cite documents clearly with [Source X] notation
7. **⚠️ Verification Disclaimer**: "Please verify this legal analysis from official law reports before relying on it in court."

⚖️ **TONE:**
- Professional and authoritative, yet clear
- Minimize legalese when possible - prioritize clarity
- Use legal precision without unnecessary jargon
- Objective and analytical

🚨 **CRITICAL ANTI-HALLUCINATION SAFEGUARDS:**
- If a case name is not explicitly in the sources, DO NOT cite it
- If a legal provision is not in the sources, DO NOT reference it
- If unsure about a legal principle, preface with "Based on available documents..."
- NEVER fabricate citations, judges' names, or case facts
- If sources are insufficient, explicitly state: "The available documents do not contain sufficient information on..."

AVAILABLE SOURCES (${chunks.length} passages from legal documents):
${context}`;

    const userPrompt = `LEGAL QUESTION: ${question}

Create a ${needsSimple ? 'comprehensive yet simple, well-structured' : 'thorough and well-organized'} legal analysis using ONLY the sources above. Follow the formatting requirements exactly. Use markdown formatting, numbered lists for statutes, bullet points for case law, and clear section headers. Include [Source X] citations after key legal points. End with the verification disclaimer.`;

    let lastError: Error | null = null;

    // Try each model in priority order
    for (const model of this.modelPriority) {
      try {
        console.log(`Attempting to generate response with ${model}...`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openrouterKey}`,
            'HTTP-Referer': 'https://legal-rag-rnd.vercel.app',
            'X-Title': 'Legal RAG R&D System'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2000 // Increased for comprehensive, well-formatted answers like Veritas
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const rawAnswer = data.choices[0].message.content;
        const { summary, answer, readingTime } = this.parseModelResponse(rawAnswer);

        // Extract token usage from API response
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);
        const grandTotal = embeddingTokens + totalTokens;

        // Calculate cost estimate based on grand total (embedding + LLM)
        const costEstimate = this.estimateCost(model, grandTotal);

        // Extract citations with full details for clickable sources
        const citations: Citation[] = await Promise.all(chunks.map(async (chunk, index) => {
          // Generate SIGNED URL for private access
          let fileUrl = undefined;
          if (chunk.file_path) {
            const { data, error } = await supabase.storage
              .from('legalrnd-documents')
              .createSignedUrl(chunk.file_path, 3600); // Valid for 1 hour

            if (data?.signedUrl) {
              fileUrl = data.signedUrl;
            } else {
              console.warn('Failed to sign URL:', error);
            }
          }

          // Normalize file type for frontend
          let fileType = chunk.file_type || 'text';

          // Check explicit type OR file extension
          const isPdf = fileType.toLowerCase() === 'pdf' ||
            fileType.toLowerCase() === 'application/pdf' ||
            (chunk.file_path && chunk.file_path.toLowerCase().endsWith('.pdf'));

          if (isPdf) {
            fileType = 'application/pdf';
          }

          return {
            document_id: chunk.document_id,
            document_title: chunk.document_title,
            master_name: chunk.master_name,
            page_number: chunk.page_number,
            chunk_id: chunk.id,
            quote: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
            full_content: chunk.content, // Full text for modal display
            similarity: chunk.similarity,
            position_in_document: chunk.position || index,
            chapter: chunk.metadata?.chapter || null,
            youtube_video_id: chunk.youtube_video_id || null,
            start_timestamp: chunk.start_timestamp || null,
            end_timestamp: chunk.end_timestamp || null,
            file_url: fileUrl,
            file_type: fileType
          };
        }));

        console.log(`✅ Successfully generated response with ${model}`);

        return {
          success: true,
          answer,
          summary,
          citations,
          reading_time: readingTime,
          metadata: {
            model,
            chunkCount: chunks.length,
            embeddingModel: 'text-embedding-3-small',
            totalTokens
          },
          debug: {
            systemPrompt,
            userPrompt
          },
          // New fields for LLM Response display
          rawResponse: rawAnswer,
          tokenUsage: {
            embeddingTokens,
            promptTokens,
            completionTokens,
            totalTokens,
            grandTotal
          },
          estimatedCost: costEstimate
        };
      } catch (error) {
        console.warn(`Failed to generate with ${model}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next model
      }
    }

    // All models failed
    throw new Error(`All models failed. Last error: ${lastError?.message}`);
  }

  /**
   * Log AI usage for comprehensive tracking
   */
  private async logAIUsage(
    lawyerId: string | null,
    query: string,
    model: string,
    tokenCount: number,
    response?: string,
    documents?: string[],
    costUSD?: number
  ): Promise<void> {
    console.log('🚀 logAIUsage function STARTED with params:', {
      lawyerId,
      model,
      tokenCount,
      hasResponse: !!response,
      documentsCount: documents?.length || 0
    });

    try {
      const promptTokens = tokenCount;
      const completionTokens = response ? Math.ceil(response.length / 4) : 0;
      const totalTokens = promptTokens + completionTokens;
      const estimatedCost = costUSD || this.estimateCost(model, totalTokens);

      const logEntry = {
        lawyer_id: lawyerId,
        model: model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost: estimatedCost,
        operation_type: 'rag_query',
        metadata: {
          query_text: query,
          documents_used: documents || [],
          response_preview: response ? response.substring(0, 500) : null
        },
        created_at: new Date().toISOString()
      };


      const { error } = await supabase.from('legalrnd_ai_usage_log').insert(logEntry);

      if (error) {
        console.error('❌ Failed to insert AI usage log:', error.message);
      }
    } catch (error) {
      // Silently fail - logging shouldn't break the query
      console.warn('Failed to log AI usage:', error);
    }
  }

  /**
   * Estimate API cost based on model and token count
   */
  private estimateCost(model: string, tokens: number): number {
    // Rough cost estimates per 1M tokens (adjust based on actual pricing)
    const costPer1M: { [key: string]: number } = {
      'x-ai/grok-2-1212': 2.0,
      'x-ai/grok-beta': 2.0,
      'google/gemini-2.0-flash-exp:free': 0,
      'anthropic/claude-3-haiku': 0.25,
      'meta-llama/llama-3.1-8b-instruct:free': 0
    };

    const modelCost = costPer1M[model] || 1.0;
    return (tokens / 1_000_000) * modelCost;
  }

  /**
   * Helper to parse the 2-part response and calculate reading time
   */
  private parseModelResponse(rawContent: string): {
    summary: string;
    answer: string;
    readingTime: { summary: string; detail: string }
  } {
    const parts = rawContent.split('---SECTION_SEPARATOR---');

    let summary = '';
    let answer = '';

    if (parts.length >= 2) {
      summary = parts[0].trim();
      answer = parts[1].trim();
      // Remove any leftover "PART 1" or "PART 2" labels if the model hallucinated them
      summary = summary.replace(/^\*\*PART 1:.*?\*\*/i, '').trim();
      answer = answer.replace(/^\*\*PART 2:.*?\*\*/i, '').trim();
    } else {
      // Fallback: If separator missing, generate a pseudo-summary from the first paragraph
      answer = rawContent.trim();
      // Try to take the first paragraph as summary (up to double newline)
      const firstParaMatch = answer.match(/^(.*?)(\n\n|$)/s);
      if (firstParaMatch && firstParaMatch[1].length < 500) { // Limit length to avoid grabbing huge chunks
        summary = firstParaMatch[1].trim();
      } else {
        summary = "Please refer to the detailed answer below.";
      }
    }

    return {
      summary,
      answer,
      readingTime: {
        summary: this.calculateReadingTime(summary),
        detail: this.calculateReadingTime(answer)
      }
    };
  }

  /**
   * Calculate reading time (assuming 200 wpm)
   */
  private calculateReadingTime(text: string): string {
    const wordCount = text.split(/\s+/).length;
    const minutes = wordCount / 200;

    if (minutes < 1) {
      return '< 1 min read';
    }
    return `${Math.ceil(minutes)} min read`;
  }
}
