import { nanoid } from 'nanoid';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AssetLibraryItem,
  CharacterAsset,
  SceneAsset,
  VoiceAsset,
  VisualStyleAsset,
  PropAsset,
  MusicAsset,
  VisualStyleParams,
  VisualStyleReference,
} from '@vishnucreator/protocol';

/**
 * Asset Library (XiaTang-style)
 * Persistent & in-memory storage for characters, scenes, props, voices, visual styles, music.
 * Inspired by DramaClaw's XiaTang asset library architecture.
 */

export interface AssetLibraryOptions {
  storageDir?: string;
}

export type AssetLibrary = ReturnType<typeof createAssetLibrary>;

export function createAssetLibrary(projectId: string, options: AssetLibraryOptions = {}) {
  const items = new Map<string, AssetLibraryItem>();
  const storageDir = options.storageDir;

  if (storageDir) {
    try {
      const projectDir = path.join(storageDir, projectId);
      if (fs.existsSync(projectDir)) {
        const files = fs.readdirSync(projectDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const raw = fs.readFileSync(path.join(projectDir, file), 'utf-8');
            const parsed = JSON.parse(raw) as AssetLibraryItem;
            items.set(parsed.id, parsed);
          }
        }
      }
    } catch (err) {
      console.warn(`[AssetLibrary] Failed to load existing assets for project ${projectId}:`, err);
    }
  }

  function persistItem(item: AssetLibraryItem): void {
    if (!storageDir) return;
    try {
      const projectDir = path.join(storageDir, projectId);
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, `${item.id}.json`), JSON.stringify(item, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[AssetLibrary] Failed to persist asset ${item.id}:`, err);
    }
  }

  function removePersistedItem(id: string): void {
    if (!storageDir) return;
    try {
      const filePath = path.join(storageDir, projectId, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`[AssetLibrary] Failed to delete persisted asset ${id}:`, err);
    }
  }

  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  function create(item: Omit<AssetLibraryItem, 'id' | 'projectId' | 'version' | 'status' | 'createdAt' | 'updatedAt'>): AssetLibraryItem {
    const newItem: AssetLibraryItem = {
      ...item,
      id: nanoid(),
      projectId,
      version: 1,
      status: 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.set(newItem.id, newItem);
    persistItem(newItem);
    return newItem;
  }

  function read(id: string): AssetLibraryItem | undefined {
    return items.get(id);
  }

  function update(id: string, updates: Partial<AssetLibraryItem>): AssetLibraryItem | null {
    const existing = items.get(id);
    if (!existing) return null;

    const updated: AssetLibraryItem = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    items.set(id, updated);
    persistItem(updated);
    return updated;
  }

  function deleteItem(id: string): boolean {
    const deleted = items.delete(id);
    if (deleted) {
      removePersistedItem(id);
    }
    return deleted;
  }

  function list(filter?: { type?: AssetLibraryItem['type']; projectId?: string; tag?: string }): AssetLibraryItem[] {
    let results = Array.from(items.values());
    if (filter?.type) {
      results = results.filter(item => item.type === filter.type);
    }
    if (filter?.projectId) {
      results = results.filter(item => item.projectId === filter.projectId);
    }
    if (filter?.tag) {
      results = results.filter(item => item.tags.includes(filter.tag!));
    }
    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // =========================================================================
  // TYPE-SPECIFIC CREATORS
  // =========================================================================

  function createCharacter(data: Omit<CharacterAsset, 'id' | 'projectId' | 'version' | 'status' | 'createdAt' | 'updatedAt' | 'type'>): CharacterAsset {
    return create({
      ...data,
      type: 'character',
    }) as CharacterAsset;
  }

  function createScene(data: Omit<SceneAsset, 'id' | 'projectId' | 'version' | 'status' | 'createdAt' | 'updatedAt' | 'type'>): SceneAsset {
    return create({
      ...data,
      type: 'scene',
    }) as SceneAsset;
  }

  function createVoice(data: Omit<VoiceAsset, 'id' | 'projectId' | 'version' | 'status' | 'createdAt' | 'updatedAt' | 'type'>): VoiceAsset {
    return create({
      ...data,
      type: 'voice',
    }) as VoiceAsset;
  }

  function createVisualStyle(data: Omit<VisualStyleAsset, 'id' | 'projectId' | 'version' | 'status' | 'createdAt' | 'updatedAt' | 'type'>): VisualStyleAsset {
    return create({
      ...data,
      type: 'visual-style',
    }) as VisualStyleAsset;
  }

  function createProp(data: Omit<PropAsset, 'id' | 'projectId' | 'version' | 'status' | 'createdAt' | 'updatedAt' | 'type'>): PropAsset {
    return create({
      ...data,
      type: 'prop',
    }) as PropAsset;
  }

  function createMusic(data: Omit<MusicAsset, 'id' | 'projectId' | 'version' | 'status' | 'createdAt' | 'updatedAt' | 'type'>): MusicAsset {
    return create({
      ...data,
      type: 'music',
    }) as MusicAsset;
  }

  // =========================================================================
  // VISUAL STYLE MANAGEMENT
  // =========================================================================

  function createVisualStyleReference(
    sourceImageId: string,
    params: VisualStyleParams,
    confidence: number
  ): VisualStyleReference {
    return {
      sourceImageId,
      extractedParams: params,
      confidence,
      appliedTo: [],
    };
  }

  function applyVisualStyleToAsset(styleRef: VisualStyleReference, assetId: string): void {
    if (!styleRef.appliedTo.includes(assetId)) {
      styleRef.appliedTo.push(assetId);
    }
  }

  // =========================================================================
  // QUERY HELPERS
  // =========================================================================

  function getJobAssetLibrary(): AssetLibraryItem[] {
    return list({ projectId });
  }

  function getAssetsByType(type: AssetLibraryItem['type']): AssetLibraryItem[] {
    return list({ projectId, type });
  }

  return {
    create,
    read,
    update,
    delete: deleteItem,
    list,
    createCharacter,
    createScene,
    createVoice,
    createVisualStyle,
    createProp,
    createMusic,
    createVisualStyleReference,
    applyVisualStyleToAsset,
    getJobAssetLibrary,
    getAssetsByType,
  };
}
