import { useState, useMemo } from 'react';
import { BookOpen, X, ExternalLink, Scale, AlertTriangle } from 'lucide-react';
import { generateLegalDatabaseLinks, isValidCitationFormat } from '@/utils/legal-link-generator';

interface Citation {
  document_id: string;
  document_title: string;
  master_name: string;
  page_number?: number;
  chunk_id: string;
  quote: string;
  full_content: string;
  similarity?: number;
  position_in_document?: number;
  chapter?: string;
  file_url?: string;
  file_type?: string;
  file_path?: string;

  // Legal-specific fields
  case_number?: string;
  citation?: string;
  court_name?: string;
}

interface SourceCitationProps {
  citations: Citation[];
}

interface GroupedCitation {
  document_id: string;
  document_title: string;
  master_name: string;
  chunks: {
    citation: Citation;
    originalIndex: number;
  }[];
}

export default function SourceCitation({ citations }: SourceCitationProps) {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // Group citations by document
  const groupedCitations = useMemo(() => {
    if (!citations) return [];

    const groups: Record<string, GroupedCitation> = {};

    citations.forEach((citation, index) => {
      if (!groups[citation.document_id]) {
        groups[citation.document_id] = {
          document_id: citation.document_id,
          document_title: citation.document_title,
          master_name: citation.master_name,
          chunks: []
        };
      }
      groups[citation.document_id].chunks.push({
        citation,
        originalIndex: index
      });
    });

    return Object.values(groups);
  }, [citations]);



  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-dark-border-primary">
      <h4 className="text-sm font-semibold text-dark-text-primary mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4" />
        Sources ({groupedCitations.length} documents, {citations.length} passages)
      </h4>

      <div className="space-y-3">
        {groupedCitations.map((group) => (
          <div key={group.document_id} className="bg-dark-bg-elevated rounded-lg border border-dark-border-primary overflow-hidden">
            {/* Parent Header - Document Level */}
            <div className="p-3 bg-dark-bg-tertiary flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="h-4 w-4 text-dark-accent-orange flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark-text-primary truncate">
                    {group.document_title}
                  </p>
                  <p className="text-xs text-dark-text-secondary">
                    {group.master_name} • {group.chunks.length} {group.chunks.length === 1 ? 'passage' : 'passages'}
                  </p>
                </div>
              </div>
            </div>

            {/* Child Links - Chunks */}
            <div className="divide-y divide-dark-border-primary">
              {group.chunks.map(({ citation, originalIndex }) => (
                <button
                  key={citation.chunk_id}
                  onClick={() => setSelectedCitation(citation)}
                  className="w-full text-left p-3 hover:bg-dark-bg-secondary transition flex items-start gap-3 group"
                >
                  <div className="mt-0.5 text-xs font-mono text-dark-accent-orange font-semibold min-w-[4.5rem] flex-shrink-0">
                    [Source {originalIndex + 1}]
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-dark-text-muted mb-1 flex items-center gap-2">
                      {citation.page_number && (
                        <span className="bg-dark-bg-primary px-1.5 py-0.5 rounded border border-dark-border-primary">
                          Page {citation.page_number}
                        </span>
                      )}
                      {citation.similarity && (
                        <span className="text-dark-accent-orange/80">
                          {(citation.similarity * 100).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-dark-text-secondary line-clamp-2 italic">
                      "{citation.quote}"
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-dark-text-muted group-hover:text-dark-accent-orange mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Source Modal */}
      {selectedCitation && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-bg-secondary rounded-lg shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200 border border-dark-border-primary">
            {/* Header */}
            <div className="p-4 border-b border-dark-border-primary bg-dark-bg-elevated flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-dark-text-primary mb-1 truncate">
                    {selectedCitation.document_title}
                  </h3>
                  <div className="flex flex-wrap gap-2 text-sm text-dark-text-secondary">
                    <span className="flex items-center gap-1">
                      <Scale className="h-3 w-3" />
                      {selectedCitation.master_name}
                    </span>
                    {selectedCitation.page_number && (
                      <span className="bg-dark-bg-tertiary text-dark-accent-orange px-2 py-0.5 rounded text-xs font-medium">Page {selectedCitation.page_number}</span>
                    )}
                  </div>

                  {/* Legal Metadata */}
                  {(selectedCitation.case_number || selectedCitation.citation || selectedCitation.court_name) && (
                    <div className="mt-3 pt-3 border-t border-dark-border-primary space-y-1.5">
                      {selectedCitation.case_number && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-dark-text-muted font-medium min-w-[80px]">Case No:</span>
                          <span className="text-dark-text-secondary">{selectedCitation.case_number}</span>
                        </div>
                      )}
                      {selectedCitation.citation && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-dark-text-muted font-medium min-w-[80px]">Citation:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-dark-text-secondary font-mono">{selectedCitation.citation}</span>
                            {!isValidCitationFormat(selectedCitation.citation) && (
                              <span className="flex items-center gap-1 text-amber-500 text-xs">
                                <AlertTriangle className="h-3 w-3" />
                                Verify
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedCitation.court_name && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-dark-text-muted font-medium min-w-[80px]">Court:</span>
                          <span className="text-dark-text-secondary">{selectedCitation.court_name}</span>
                        </div>
                      )}

                      {/* Legal Database Links */}
                      {selectedCitation.citation && (
                        <div className="mt-3 pt-2 border-t border-dark-border-primary">
                          <p className="text-xs text-dark-text-muted font-medium mb-2">Search in Legal Databases:</p>
                          <div className="flex flex-wrap gap-2">
                            {generateLegalDatabaseLinks(selectedCitation.citation, selectedCitation.document_title).map((link) => (
                              <a
                                key={link.name}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2 py-1 bg-dark-bg-tertiary hover:bg-dark-bg-primary text-dark-text-secondary hover:text-dark-accent-orange text-xs rounded border border-dark-border-primary transition"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {link.name}
                                {link.isFree && <span className="text-green-500 ml-1">•</span>}
                              </a>
                            ))}
                          </div>
                          <p className="text-xs text-dark-text-muted mt-2 italic">
                            • Green dot indicates free access
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedCitation(null)}
                  className="p-2 hover:bg-dark-bg-tertiary rounded-lg transition flex-shrink-0 text-dark-text-muted hover:text-dark-text-primary"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col relative bg-dark-bg-primary">
              {/* PDF Viewer */}
              {selectedCitation.file_url && selectedCitation.file_type === 'application/pdf' ? (
                <div className="w-full h-full">
                  <object
                    data={`${selectedCitation.file_url}#page=${selectedCitation.page_number || 1}`}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(selectedCitation.file_url)}&embedded=true`}
                      className="w-full h-full border-none"
                      title="PDF Viewer"
                    />
                  </object>
                </div>
              ) : (
                // Fallback to text view
                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                  <div className="bg-dark-bg-secondary p-8 rounded-xl shadow-sm border border-dark-border-primary max-w-3xl mx-auto">
                    <div className="prose prose-invert max-w-none">
                      <div className="bg-dark-bg-elevated border-l-4 border-dark-accent-orange p-6 rounded-r-lg mb-6">
                        <h4 className="text-sm font-semibold text-dark-accent-orange uppercase tracking-wider mb-2">Selected Passage</h4>
                        <p className="text-dark-text-primary leading-relaxed font-serif text-lg italic">
                          "{selectedCitation.full_content}"
                        </p>
                      </div>

                      <div className="text-center text-dark-text-muted text-sm mt-8">
                        <p>Full document preview is only available for PDF files.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with Metadata */}
            <div className="p-3 bg-dark-bg-elevated border-t border-dark-border-primary flex justify-between text-xs text-dark-text-muted flex-shrink-0">
              <div>ID: {selectedCitation.chunk_id.substring(0, 8)}</div>
              {selectedCitation.similarity && (
                <div>Match Score: {(selectedCitation.similarity * 100).toFixed(1)}%</div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
