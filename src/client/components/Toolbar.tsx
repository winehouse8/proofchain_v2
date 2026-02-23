// Clock Canvas - Top Toolbar
// REQ-CV-019 through REQ-CV-025

import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { useAppState, useAppDispatch, useToast } from '../store.js';
import * as api from '../api.js';
import type { ExportSchema } from '../types.js';

interface ToolbarProps {
  onOpenProjectDialog: () => void;
  onOpenCodePreview: () => void;
}

export default function Toolbar({ onOpenProjectDialog, onOpenCodePreview }: ToolbarProps) {
  const { projectId, projectName } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  // REQ-CV-019: Save
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!projectId) {
        // REQ-CV-027: Prompt for name on new canvas
        const name = window.prompt('Project name:', projectName);
        if (!name) {
          setSaving(false);
          return;
        }
        const project = await api.createProject(name);
        dispatch({ type: 'SET_PROJECT_NAME', name: project.name });
        // Reload to get the project with its ID
        // For a new project, there are no nodes/edges yet to save
        dispatch({
          type: 'SET_PROJECT',
          projectId: project.id,
          projectName: project.name,
          nodes: [],
          edges: [],
        });
        showToast(`Project "${project.name}" created`, 'success');
      } else {
        await api.updateProject(projectId, projectName);
        showToast('Project saved', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [projectId, projectName, saving, dispatch, showToast]);

  // REQ-CV-020: Load
  const handleLoad = useCallback(() => {
    onOpenProjectDialog();
  }, [onOpenProjectDialog]);

  // REQ-CV-021: Export JSON
  const handleExport = useCallback(async () => {
    if (!projectId) {
      showToast('Save the project first before exporting', 'info');
      return;
    }
    try {
      await api.exportProject(projectId);
      showToast('Project exported', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }, [projectId, showToast]);

  // REQ-CV-022: Import JSON
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportSchema;
      const project = await api.importProject(data);
      // Load the imported project
      const loaded = await api.getProject(project.id);
      dispatch({
        type: 'SET_PROJECT',
        projectId: loaded.id,
        projectName: loaded.name,
        nodes: loaded.nodes,
        edges: loaded.edges,
      });
      showToast(`Project "${loaded.name}" imported`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [dispatch, showToast]);

  // REQ-CV-023: Generate code
  const handleGenerate = useCallback(() => {
    if (!projectId) {
      showToast('Save the project first before generating code', 'info');
      return;
    }
    onOpenCodePreview();
  }, [projectId, showToast, onOpenCodePreview]);

  // REQ-CV-024: CDC Check
  const handleCDCCheck = useCallback(async () => {
    if (!projectId) {
      showToast('Save the project first', 'info');
      return;
    }
    try {
      const result = await api.analyzeCDC(projectId);
      dispatch({ type: 'SET_CDC_CROSSINGS', crossings: result.crossings });
      if (result.crossings.length === 0) {
        showToast('No CDC crossings detected', 'success');
      } else {
        showToast(`${result.crossings.length} CDC crossing(s) found`, 'warning');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'CDC check failed', 'error');
    }
  }, [projectId, dispatch, showToast]);

  // REQ-CV-025: Gating Analysis
  const handleGatingAnalysis = useCallback(async () => {
    if (!projectId) {
      showToast('Save the project first', 'info');
      return;
    }
    try {
      const result = await api.analyzeGating(projectId);
      const msg = `Gated: ${result.gated_count}, Ungated: ${result.ungated_count}, ` +
        `Total: ${result.total_count}, Power reduction: ${result.power_reduction_pct.toFixed(1)}%`;
      showToast(msg, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gating analysis failed', 'error');
    }
  }, [projectId, showToast]);

  // New project
  const handleNew = useCallback(() => {
    dispatch({ type: 'CLEAR_PROJECT' });
  }, [dispatch]);

  return (
    <div className="toolbar">
      <span className="toolbar-title">Clock Canvas</span>
      <div className="toolbar-separator" />

      <button className="toolbar-btn" onClick={handleNew}>New</button>
      <button className="toolbar-btn" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button className="toolbar-btn" onClick={handleLoad}>Load</button>

      <div className="toolbar-separator" />

      <button className="toolbar-btn" onClick={handleExport}>Export</button>
      <button className="toolbar-btn" onClick={handleImport}>Import</button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden-file-input"
        onChange={e => void handleFileChange(e)}
      />

      <div className="toolbar-separator" />

      <button className="toolbar-btn toolbar-btn--accent" onClick={handleGenerate}>
        Generate
      </button>

      <div className="toolbar-separator" />

      <button className="toolbar-btn" onClick={() => void handleCDCCheck()}>CDC Check</button>
      <button className="toolbar-btn" onClick={() => void handleGatingAnalysis()}>Gating</button>

      <div className="toolbar-spacer" />

      <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
        {projectName}{projectId ? '' : ' (unsaved)'}
      </span>
    </div>
  );
}
