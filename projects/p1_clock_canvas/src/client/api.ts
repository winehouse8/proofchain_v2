// Clock Canvas - REST API Client
// All backend communication goes through this module

import type {
  ClockNode,
  ClockEdge,
  ProjectData,
  ProjectListItem,
  Project,
  CreateNodeRequest,
  UpdateNodeRequest,
  CreateConnectionRequest,
  CDCCrossing,
  GatingAnalysis,
  CodePreview,
  ExportSchema,
} from './types.js';

class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: string }).message)
      : `API error (${status})`);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = { message: res.statusText };
    }
    throw new ApiError(res.status, body);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ==================== Projects ====================

export async function createProject(name: string): Promise<Project> {
  return request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function listProjects(): Promise<ProjectListItem[]> {
  return request<ProjectListItem[]>('/api/projects');
}

export async function getProject(projectId: string): Promise<ProjectData> {
  return request<ProjectData>(`/api/projects/${projectId}`);
}

export async function updateProject(projectId: string, name: string): Promise<Project> {
  return request<Project>(`/api/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });
}

// ==================== Nodes ====================

export async function createNode(projectId: string, data: CreateNodeRequest): Promise<ClockNode> {
  return request<ClockNode>(`/api/projects/${projectId}/nodes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNode(
  projectId: string,
  nodeId: string,
  data: UpdateNodeRequest,
): Promise<ClockNode> {
  return request<ClockNode>(`/api/projects/${projectId}/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteNode(projectId: string, nodeId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/nodes/${nodeId}`, {
    method: 'DELETE',
  });
}

// @tc: TC-CC-CV-007, TC-CC-CV-005
// @req: REQ-CV-007, REQ-CV-005
export async function deleteNodesBatch(projectId: string, ids: string[]): Promise<void> {
  return request<void>(`/api/projects/${projectId}/nodes/batch`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

// ==================== Connections ====================

export async function createConnection(
  projectId: string,
  data: CreateConnectionRequest,
): Promise<ClockEdge> {
  return request<ClockEdge>(`/api/projects/${projectId}/connections`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteConnection(projectId: string, connId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/connections/${connId}`, {
    method: 'DELETE',
  });
}

// @tc: TC-CC-CV-015, TC-CC-CV-005
// @req: REQ-CV-012, REQ-CV-005
export async function deleteConnectionsBatch(projectId: string, ids: string[]): Promise<void> {
  return request<void>(`/api/projects/${projectId}/connections/batch`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

// ==================== Analysis ====================

export async function analyzeCDC(projectId: string): Promise<{ crossings: CDCCrossing[] }> {
  return request<{ crossings: CDCCrossing[] }>(`/api/projects/${projectId}/analysis/cdc`);
}

export async function analyzeGating(projectId: string): Promise<GatingAnalysis> {
  return request<GatingAnalysis>(`/api/projects/${projectId}/analysis/gating`);
}

// ==================== Code Generation ====================

export async function generatePreview(projectId: string): Promise<CodePreview> {
  return request<CodePreview>(`/api/projects/${projectId}/generate/preview`);
}

export async function generateDownload(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/generate/download`);
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = { message: res.statusText };
    }
    throw new ApiError(res.status, body);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] ?? 'clock_design.zip';

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ==================== Export / Import ====================

export async function exportProject(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/export`);
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = { message: res.statusText };
    }
    throw new ApiError(res.status, body);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] ?? 'project.json';

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export async function importProject(data: ExportSchema): Promise<Project> {
  return request<Project>('/api/projects/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
