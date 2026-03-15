// Clock Canvas - Code Generation Preview Dialog
// REQ-CV-023: Generate button -> preview dialog -> download ZIP

import { useState, useEffect, useCallback } from 'react';
import { useAppState, useToast } from '../../store.js';
import * as api from '../../api.js';
import type { CodePreview } from '../../types.js';

interface CodePreviewDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CodePreviewDialog({ open, onClose }: CodePreviewDialogProps) {
  const { projectId } = useAppState();
  const showToast = useToast();
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [activeTab, setActiveTab] = useState<'rtl' | 'sdc'>('rtl');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    setPreview(null);

    api.generatePreview(projectId)
      .then(data => {
        setPreview(data);
      })
      .catch(err => {
        showToast(err instanceof Error ? err.message : 'Failed to generate preview', 'error');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [open, projectId, showToast, onClose]);

  const handleDownload = useCallback(async () => {
    if (!projectId || downloading) return;
    setDownloading(true);
    try {
      await api.generateDownload(projectId);
      showToast('Download started', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  }, [projectId, downloading, showToast]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 650 }} onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <span>Code Preview</span>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {loading && <div style={{ textAlign: 'center', padding: '24px' }}>Generating...</div>}
          {preview && (
            <>
              <div className="code-preview-tabs">
                <button
                  className={`code-preview-tab ${activeTab === 'rtl' ? 'code-preview-tab--active' : ''}`}
                  onClick={() => setActiveTab('rtl')}
                >
                  RTL (Verilog)
                </button>
                <button
                  className={`code-preview-tab ${activeTab === 'sdc' ? 'code-preview-tab--active' : ''}`}
                  onClick={() => setActiveTab('sdc')}
                >
                  SDC (Constraints)
                </button>
              </div>
              <pre className="code-preview-content">
                {activeTab === 'rtl' ? preview.rtl : preview.sdc}
              </pre>
            </>
          )}
        </div>
        <div className="dialog-footer">
          <button className="dialog-btn" onClick={onClose}>Close</button>
          <button
            className="dialog-btn dialog-btn--primary"
            onClick={() => void handleDownload()}
            disabled={loading || downloading || !preview}
          >
            {downloading ? 'Downloading...' : 'Download ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
