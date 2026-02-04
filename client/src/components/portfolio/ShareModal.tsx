import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Link2,
  Copy,
  Check,
  Trash2,
  Mail,
  Clock,
  Eye,
  Edit3,
  Users,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/api/client';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  portfolioName: string;
}

interface Share {
  id: string;
  portfolioId: string;
  portfolioName: string;
  shareUrl: string;
  permissions: 'view' | 'edit';
  sharedWithEmail: string | null;
  createdAt: string;
  expiresAt: string | null;
  accessCount: number;
  lastAccessed: string | null;
  isExpired: boolean;
}

interface CreateShareResponse {
  data: {
    id: string;
    shareToken: string;
    shareUrl: string;
    permissions: 'view' | 'edit';
    expiresAt: string | null;
    sharedWithEmail: string | null;
    createdAt: string;
  };
}

const EXPIRATION_OPTIONS = [
  { value: 0, label: 'Never expires' },
  { value: 1, label: '1 hour' },
  { value: 24, label: '1 day' },
  { value: 168, label: '1 week' },
  { value: 720, label: '30 days' },
];

export function ShareModal({ isOpen, onClose, portfolioId, portfolioName }: ShareModalProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    permissions: 'view' as 'view' | 'edit',
    expiresIn: 0,
    shareWithEmail: '',
  });

  // Fetch existing shares
  const { data: sharesResponse, isLoading: loadingShares } = useQuery<{ data: Share[] }>({
    queryKey: ['portfolio-shares'],
    queryFn: () => api.get('/portfolio/share'),
    enabled: isOpen,
  });

  const shares = (sharesResponse?.data || []).filter(
    (share) => share.portfolioId === portfolioId
  );

  // Create share mutation
  const createShareMutation = useMutation({
    mutationFn: (data: {
      portfolioId: string;
      permissions: 'view' | 'edit';
      expiresIn?: number;
      shareWithEmail?: string;
    }) => api.post('/portfolio/share', data) as Promise<CreateShareResponse>,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-shares'] });
      setNewShareUrl(response.data.shareUrl);
      setShowCreateForm(false);
      setFormData({ permissions: 'view', expiresIn: 0, shareWithEmail: '' });
    },
  });

  // Revoke share mutation
  const revokeShareMutation = useMutation({
    mutationFn: (shareId: string) => api.delete(`/portfolio/share/${shareId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-shares'] });
    },
  });

  const handleCreateShare = (e: React.FormEvent) => {
    e.preventDefault();
    createShareMutation.mutate({
      portfolioId,
      permissions: formData.permissions,
      expiresIn: formData.expiresIn || undefined,
      shareWithEmail: formData.shareWithEmail || undefined,
    });
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Share Portfolio</h2>
                <p className="text-sm text-gray-500">{portfolioName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Success message for new share */}
            {newShareUrl && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">Share link created!</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={newShareUrl}
                        readOnly
                        className="flex-1 px-3 py-2 text-sm bg-white border border-green-200 rounded-lg"
                      />
                      <Button
                        size="sm"
                        onClick={() => copyToClipboard(newShareUrl)}
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Create new share button or form */}
            {!showCreateForm ? (
              <Button
                onClick={() => setShowCreateForm(true)}
                className="w-full"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Create New Share Link
              </Button>
            ) : (
              <form onSubmit={handleCreateShare} className="space-y-4 bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900">Create New Share</h3>

                {/* Permissions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Permissions
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: 'view' })}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                        formData.permissions === 'view'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Eye className={`w-5 h-5 ${formData.permissions === 'view' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div className="text-left">
                        <p className={`text-sm font-medium ${formData.permissions === 'view' ? 'text-blue-700' : 'text-gray-700'}`}>
                          View Only
                        </p>
                        <p className="text-xs text-gray-500">Can see portfolio</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: 'edit' })}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                        formData.permissions === 'edit'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Edit3 className={`w-5 h-5 ${formData.permissions === 'edit' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div className="text-left">
                        <p className={`text-sm font-medium ${formData.permissions === 'edit' ? 'text-blue-700' : 'text-gray-700'}`}>
                          Can Edit
                        </p>
                        <p className="text-xs text-gray-500">Full access</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Expiration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Expires
                  </label>
                  <select
                    value={formData.expiresIn}
                    onChange={(e) => setFormData({ ...formData, expiresIn: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {EXPIRATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Share with email (optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Share with email (optional)
                  </label>
                  <input
                    type="email"
                    value={formData.shareWithEmail}
                    onChange={(e) => setFormData({ ...formData, shareWithEmail: e.target.value })}
                    placeholder="colleague@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If the email is registered, they will be linked to this share.
                  </p>
                </div>

                {/* Error message */}
                {createShareMutation.isError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    Failed to create share. Please try again.
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    type="submit"
                    disabled={createShareMutation.isPending}
                    className="flex-1"
                  >
                    {createShareMutation.isPending ? (
                      <Spinner className="w-4 h-4" />
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        Create Link
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {/* Existing shares */}
            <div>
              <h3 className="flex items-center gap-2 font-medium text-gray-900 mb-3">
                <Globe className="w-4 h-4" />
                Active Share Links
              </h3>

              {loadingShares ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="w-6 h-6" />
                </div>
              ) : shares.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Link2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No active share links</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create a link to share your portfolio with others
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className={`p-4 border rounded-lg ${
                        share.isExpired
                          ? 'bg-gray-50 border-gray-200 opacity-60'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                                share.permissions === 'edit'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {share.permissions === 'edit' ? (
                                <>
                                  <Edit3 className="w-3 h-3 mr-1" />
                                  Edit
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3 mr-1" />
                                  View
                                </>
                              )}
                            </span>
                            {share.isExpired && (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
                                Expired
                              </span>
                            )}
                          </div>

                          {share.sharedWithEmail && (
                            <p className="text-sm text-gray-600 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {share.sharedWithEmail}
                            </p>
                          )}

                          <p className="text-xs text-gray-500 mt-1">
                            Created {formatDate(share.createdAt)}
                            {share.expiresAt && ` | Expires ${formatDate(share.expiresAt)}`}
                          </p>

                          {share.accessCount > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              Accessed {share.accessCount} time{share.accessCount !== 1 ? 's' : ''}
                              {share.lastAccessed && ` | Last: ${formatDate(share.lastAccessed)}`}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyToClipboard(share.shareUrl)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Copy link"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => revokeShareMutation.mutate(share.id)}
                            disabled={revokeShareMutation.isPending}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Revoke share"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
