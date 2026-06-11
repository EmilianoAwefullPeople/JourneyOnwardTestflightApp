export type TemplateStatus = 'built' | 'new';

export interface TemplateRegistryEntry {
  id: string;
  displayName: string;
  minPhotos: number;
  maxPhotos: number;
  status: TemplateStatus;
  /** IDs of conditions that make this template recommended */
  conditions: string[];
}

export const TEMPLATE_REGISTRY: TemplateRegistryEntry[] = [
  { id: 'T-01', displayName: 'Quad Collage', minPhotos: 4, maxPhotos: 4, status: 'new', conditions: ['4-photos', 'multi-moment'] },
  { id: 'T-03', displayName: 'Statement Card', minPhotos: 1, maxPhotos: 1, status: 'new', conditions: ['1-photo', 'caption'] },
  { id: 'T-02', displayName: 'Camera Frame', minPhotos: 1, maxPhotos: 1, status: 'new', conditions: ['1-photo', 'landmark'] },
  { id: 'T-04', displayName: 'Scrapbook', minPhotos: 2, maxPhotos: 3, status: 'new', conditions: ['2-photos', 'leisure'] },
  { id: 'T-06', displayName: 'Triptych Stamps', minPhotos: 3, maxPhotos: 3, status: 'new', conditions: ['3-photos', 'environmental'] },
  { id: 'T-11', displayName: 'Diptych', minPhotos: 2, maxPhotos: 2, status: 'built', conditions: ['2-photos'] },
  { id: 'T-05', displayName: 'iMessage Thread', minPhotos: 1, maxPhotos: 2, status: 'new', conditions: ['1-photo', 'casual'] },
  { id: 'T-07', displayName: 'Notes Journal', minPhotos: 1, maxPhotos: 1, status: 'new', conditions: ['1-photo', 'quiet'] },
  { id: 'T-08', displayName: 'Notes Data Log', minPhotos: 1, maxPhotos: 1, status: 'new', conditions: ['1-photo', 'data-rich'] },
  { id: 'T-09', displayName: 'Mosaic Bold', minPhotos: 3, maxPhotos: 4, status: 'new', conditions: ['4-photos', 'milestone'] },
  { id: 'T-10', displayName: 'Minimal', minPhotos: 1, maxPhotos: 1, status: 'new', conditions: ['1-photo', 'iconic'] },
  { id: 'T-12', displayName: 'Triptych Badge', minPhotos: 3, maxPhotos: 3, status: 'new', conditions: ['3-photos', 'environmental-contrast'] },
];

export function getTemplateById(id: string): TemplateRegistryEntry | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id);
}
