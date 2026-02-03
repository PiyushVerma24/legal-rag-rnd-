import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function AuthPage() {
  const [selectedUser, setSelectedUser] = useState('');
  const navigate = useNavigate();

  const testUsers = [
    { email: 'admin@legalrnd.com', name: 'Admin', role: 'Administrator', icon: '👨‍💼' },
    { email: 'lawyer1@legalrnd.com', name: 'Adv. Rajesh Kumar', role: 'Lawyer', icon: '⚖️' },
    { email: 'lawyer2@legalrnd.com', name: 'Adv. Priya Sharma', role: 'Lawyer', icon: '⚖️' },
    { email: 'lawyer3@legalrnd.com', name: 'Adv. Amit Verma', role: 'Lawyer', icon: '⚖️' }
  ];

  const handleQuickLogin = (email: string, name: string) => {
    setSelectedUser(email);
    toast.success(`Welcome ${name}! ⚖️`);

    // Auto-navigate after a brief moment
    setTimeout(() => {
      if (email === 'admin@legalrnd.com') {
        navigate('/admin');
      } else {
        navigate('/chat');
      }
    }, 300);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-lg w-full bg-white rounded-xl shadow-xl border border-blue-100 p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-900 mb-2 flex items-center justify-center gap-2">
            ⚖️ Legal RAG R&D
          </h1>
          <p className="text-gray-600">Legal Research & Analysis System</p>
          <p className="text-xs text-blue-600 mt-2">Quick Login for Testing</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700 mb-4">Select User to Login:</p>

          {testUsers.map((user) => (
            <div
              key={user.email}
              onClick={() => handleQuickLogin(user.email, user.name)}
              className={`
                flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all
                ${selectedUser === user.email
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/50'
                }
              `}
            >
              <input
                type="radio"
                name="user"
                checked={selectedUser === user.email}
                onChange={() => { }}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />

              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">{user.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-600">{user.email}</p>
                </div>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {user.role}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-800 font-medium mb-1">💡 Quick Login Enabled</p>
          <p className="text-xs text-blue-700">
            Click any user to instantly login and navigate to their dashboard
          </p>
        </div>
      </div>
    </div>
  );
}
