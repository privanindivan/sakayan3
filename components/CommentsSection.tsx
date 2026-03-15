'use client';
import { useState, useEffect } from 'react';

interface Comment {
  id: string;
  body: string;
  upvotes: number;
  username: string;
  avatar_url?: string;
  created_at: string;
}

interface Props {
  entityType: 'route' | 'stop';
  entityId: string;
  user: any;
  onLoginRequired: () => void;
}

export default function CommentsSection({ entityType, entityId, user, onLoginRequired }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/comments?entity_type=${entityType}&entity_id=${entityId}`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []));
  }, [entityType, entityId]);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { onLoginRequired(); return; }
    if (!body.trim()) return;
    setLoading(true);
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, body }),
    });
    const data = await res.json();
    if (res.ok) {
      setComments(prev => [{ ...data.comment, username: user.username }, ...prev]);
      setBody('');
    }
    setLoading(false);
  }

  async function upvote(commentId: string) {
    if (!user) { onLoginRequired(); return; }
    const res = await fetch(`/api/comments/${commentId}/upvote`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, upvotes: c.upvotes + (data.action === 'added' ? 1 : -1) }
          : c
      ));
    }
  }

  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Comments</h4>
      <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
        {comments.length === 0 && <p className="text-xs text-gray-400">No comments yet.</p>}
        {comments.map(c => (
          <div key={c.id} className="bg-gray-50 rounded p-2 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-medium text-gray-800">{c.username}</span>
              <button
                onClick={() => upvote(c.id)}
                className="flex items-center gap-1 text-gray-400 hover:text-blue-500 transition-colors"
              >
                <span>&#9650;</span><span>{c.upvotes}</span>
              </button>
            </div>
            <p className="text-gray-600 mt-0.5">{c.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={postComment} className="flex gap-1">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={user ? 'Add a comment...' : 'Login to comment'}
          className="flex-1 border rounded px-2 py-1 text-xs"
          onClick={() => { if (!user) onLoginRequired(); }}
          readOnly={!user}
        />
        {user && (
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Post
          </button>
        )}
      </form>
    </div>
  );
}
