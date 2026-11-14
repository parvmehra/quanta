import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/ui';

export default function NotFound() {
  return (
    <div style={{ padding: '64px 16px' }}>
      <EmptyState
        title="Page not found"
        action={<Link to="/analyzer" className="btn btn-secondary btn-sm">Go to Stock Explorer</Link>}
      >
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  );
}
