import { writable, derived, get } from 'svelte/store';
import { api } from '../lib/api';
import type {
  AgentTemplate,
  AgentTemplateCreate,
  AgentTemplateUpdate,
  AgentTemplateWithSteps,
  AgentStep,
  AgentStepCreate,
  AgentStepUpdate,
  AgentStepEdge,
} from '../lib/types';

// Stores
export const templates = writable<AgentTemplate[]>([]);
export const templatesLoading = writable<boolean>(false);
export const templatesError = writable<string | null>(null);

export const selectedTemplateId = writable<number | null>(null);
export const selectedTemplate = writable<AgentTemplateWithSteps | null>(null);
export const selectedTemplateLoading = writable<boolean>(false);

// Derived stores
export const sortedTemplates = derived(templates, ($templates) => {
  return [...$templates].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
});

// Template CRUD
export async function loadTemplates(): Promise<void> {
  templatesLoading.set(true);
  templatesError.set(null);

  try {
    const data = await api.listTemplates();
    templates.set(data);
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to load templates');
  } finally {
    templatesLoading.set(false);
  }
}

export async function loadTemplate(id: number): Promise<AgentTemplateWithSteps | null> {
  selectedTemplateLoading.set(true);
  templatesError.set(null);

  try {
    const data = await api.getTemplate(id);
    selectedTemplate.set(data);
    selectedTemplateId.set(id);
    return data;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to load template');
    return null;
  } finally {
    selectedTemplateLoading.set(false);
  }
}

export async function createTemplate(data: AgentTemplateCreate): Promise<AgentTemplateWithSteps | null> {
  templatesError.set(null);

  try {
    const template = await api.createTemplate(data);
    templates.update(ts => [template, ...ts]);
    selectedTemplate.set(template);
    selectedTemplateId.set(template.id);
    return template;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to create template');
    return null;
  }
}

export async function updateTemplate(id: number, data: AgentTemplateUpdate): Promise<AgentTemplate | null> {
  templatesError.set(null);

  try {
    const template = await api.updateTemplate(id, data);
    templates.update(ts => ts.map(t => t.id === id ? template : t));

    // Update selected template if it's the one being modified
    if (get(selectedTemplateId) === id) {
      selectedTemplate.update(t => t ? { ...t, ...template } : null);
    }

    return template;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to update template');
    return null;
  }
}

export async function deleteTemplate(id: number): Promise<boolean> {
  templatesError.set(null);

  try {
    await api.deleteTemplate(id);
    templates.update(ts => ts.filter(t => t.id !== id));

    if (get(selectedTemplateId) === id) {
      selectedTemplateId.set(null);
      selectedTemplate.set(null);
    }

    return true;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to delete template');
    return false;
  }
}

export function selectTemplate(id: number | null): void {
  selectedTemplateId.set(id);
  if (id === null) {
    selectedTemplate.set(null);
  } else {
    loadTemplate(id);
  }
}

// Step CRUD
export async function createStep(templateId: number, data: AgentStepCreate): Promise<AgentStep | null> {
  templatesError.set(null);

  try {
    const step = await api.createStep(templateId, data);

    // Update selected template with new step
    selectedTemplate.update(t => {
      if (t && t.id === templateId) {
        return { ...t, steps: [...t.steps, step] };
      }
      return t;
    });

    return step;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to create step');
    return null;
  }
}

export async function updateStep(templateId: number, stepId: number, data: AgentStepUpdate): Promise<AgentStep | null> {
  templatesError.set(null);

  try {
    const step = await api.updateStep(templateId, stepId, data);

    // Update selected template with updated step
    selectedTemplate.update(t => {
      if (t && t.id === templateId) {
        return {
          ...t,
          steps: t.steps.map(s => s.id === stepId ? step : s),
        };
      }
      return t;
    });

    return step;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to update step');
    return null;
  }
}

export async function deleteStep(templateId: number, stepId: number): Promise<boolean> {
  templatesError.set(null);

  try {
    await api.deleteStep(templateId, stepId);

    // Update selected template
    selectedTemplate.update(t => {
      if (t && t.id === templateId) {
        return {
          ...t,
          steps: t.steps.filter(s => s.id !== stepId),
          edges: t.edges.filter(e => e.parent_id !== stepId && e.child_id !== stepId),
        };
      }
      return t;
    });

    return true;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to delete step');
    return false;
  }
}

// Edge CRUD
export async function createEdge(templateId: number, edge: AgentStepEdge): Promise<AgentStepEdge | null> {
  templatesError.set(null);

  try {
    const newEdge = await api.createEdge(templateId, edge);

    // Update selected template with new edge
    selectedTemplate.update(t => {
      if (t && t.id === templateId) {
        // Update parent_ids/child_ids in steps
        const steps = t.steps.map(s => {
          if (s.id === edge.parent_id) {
            return { ...s, child_ids: [...s.child_ids, edge.child_id] };
          }
          if (s.id === edge.child_id) {
            return { ...s, parent_ids: [...s.parent_ids, edge.parent_id] };
          }
          return s;
        });

        return { ...t, steps, edges: [...t.edges, newEdge] };
      }
      return t;
    });

    return newEdge;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to create edge');
    return null;
  }
}

export async function deleteEdge(templateId: number, edge: AgentStepEdge): Promise<boolean> {
  templatesError.set(null);

  try {
    await api.deleteEdge(templateId, edge);

    // Update selected template
    selectedTemplate.update(t => {
      if (t && t.id === templateId) {
        // Update parent_ids/child_ids in steps
        const steps = t.steps.map(s => {
          if (s.id === edge.parent_id) {
            return { ...s, child_ids: s.child_ids.filter(id => id !== edge.child_id) };
          }
          if (s.id === edge.child_id) {
            return { ...s, parent_ids: s.parent_ids.filter(id => id !== edge.parent_id) };
          }
          return s;
        });

        return {
          ...t,
          steps,
          edges: t.edges.filter(e => !(e.parent_id === edge.parent_id && e.child_id === edge.child_id)),
        };
      }
      return t;
    });

    return true;
  } catch (error) {
    templatesError.set(error instanceof Error ? error.message : 'Failed to delete edge');
    return false;
  }
}
