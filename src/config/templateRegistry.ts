export type TemplateStatus = 'built' | 'new';
export type TemplateCategory = 'styled' | 'collage';

export interface TemplateRegistryEntry {
  id: string;
  displayName: string;
  minPhotos: number;
  maxPhotos: number;
  status: TemplateStatus;
  category: TemplateCategory;
  /** IDs of conditions that make this template recommended */
  conditions: string[];
}

export const TEMPLATE_REGISTRY: TemplateRegistryEntry[] = [
  { id: 'T-01', displayName: 'Quad Collage', minPhotos: 4, maxPhotos: 4, status: 'new', category: 'styled', conditions: ['4-photos', 'multi-moment'] },
  { id: 'T-04', displayName: 'Location Tag', minPhotos: 1, maxPhotos: 2, status: 'new', category: 'styled', conditions: ['2-photos', 'landmark'] },
  { id: 'T-03', displayName: 'Statement Card', minPhotos: 1, maxPhotos: 1, status: 'new', category: 'styled', conditions: ['1-photo', 'caption'] },
  { id: 'T-02', displayName: 'Camera Frame', minPhotos: 1, maxPhotos: 1, status: 'new', category: 'styled', conditions: ['1-photo', 'landmark'] },
  { id: 'T-06', displayName: 'Triptych Stamps', minPhotos: 3, maxPhotos: 3, status: 'new', category: 'styled', conditions: ['3-photos', 'environmental'] },
  { id: 'T-11', displayName: 'Diptych', minPhotos: 2, maxPhotos: 2, status: 'built', category: 'styled', conditions: ['2-photos'] },
  { id: 'T-05', displayName: 'iMessage Thread', minPhotos: 1, maxPhotos: 2, status: 'new', category: 'styled', conditions: ['1-photo', 'casual'] },
  { id: 'T-07', displayName: 'Month Calendar', minPhotos: 1, maxPhotos: 1, status: 'new', category: 'styled', conditions: ['1-photo'] },
  { id: 'T-12', displayName: 'Map Pin', minPhotos: 1, maxPhotos: 1, status: 'new', category: 'styled', conditions: ['1-photo', 'landmark'] },
  { id: 'C-01', displayName: 'Two Rows', minPhotos: 2, maxPhotos: 2, status: 'new', category: 'collage', conditions: [] },
  { id: 'C-02', displayName: 'Three Rows', minPhotos: 3, maxPhotos: 3, status: 'new', category: 'collage', conditions: [] },
  { id: 'C-03', displayName: '2×2 Grid', minPhotos: 4, maxPhotos: 4, status: 'new', category: 'collage', conditions: [] },
  { id: 'C-04', displayName: '2×3 Grid', minPhotos: 6, maxPhotos: 6, status: 'new', category: 'collage', conditions: [] },
  { id: 'C-05', displayName: 'One Above Two', minPhotos: 3, maxPhotos: 3, status: 'new', category: 'collage', conditions: [] },
];

export function getTemplateById(id: string): TemplateRegistryEntry | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id);
}
