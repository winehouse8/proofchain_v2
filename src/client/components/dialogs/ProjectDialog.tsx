// Clock Canvas - Project List/Load Dialog
// REQ-CV-020: Load button -> project list dialog -> load

import { useState, useEffect, useCallback } from 'react';
import { useAppDispatch, useToast } from '../../store.js';
import * as api from '../../api.js';
import type { ProjectListItem } from '../../types.js';

interface ProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ProjectDialog({ open, onClose }: ProjectDialogProps) {
  const dispatch = useAppDispatch();
  const showToast = useToast();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.listProjects()
      .then(data => setProjects(data))
      .catch(err => {
        showToast(err instanceof Error ? err.message : 'Failed to load projects', 'error');
      })
      .finally(() => setLoading(false));
  }, [open, showToast]);

  const handleLoad = useCallback(async (projectId: string) => {
    try {
      dispatch({ type: 'SET_LOADING', loading: true });
      const data = await api.getProject(projectId);
      dispatch({
        type: 'SET_PROJECT',
        projectId: data.id,
        projectName: data.name,
        nodes: data.nodes,
        edges: data.edges,
      });
      showToast(`Loaded "${data.name}"`, 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load project', 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [dispatch, showToast, onClose]);

  const handleDelete = useCallback(async (e: React.MouseEvent, projectId: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete project "${name}"?`)) return;
    try {
      await api.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      showToast(`Deleted "${name}"`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete project', 'error');
    }
  }, [showToast]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <span>Projects</span>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body" style={{ padding: 0 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '24px' }}>Loading...</div>
          )}
          {!loading && projects.length === 0 && (
            <div className="project-list-empty">No projects yet</div>
          )}
          {!loading && projects.length > 0 && (
            <ul className="project-list">
              {projects.map(p => (
                <li
                  key={p.id}
                  className="project-list-item"
                  onClick={() => void handleLoad(p.id)}
                >
                  <div>
                    <div className="project-list-item-name">{p.name}</div>
                    <div className="project-list-item-meta">
                      {p.node_count} nodes &middot; {new Date(p.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="dialog-btn dialog-btn--danger"
                    onClick={e => void handleDelete(e, p.id, p.name)}
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="dialog-footer">
          <button className="dialog-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
