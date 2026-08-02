import Dexie, { type EntityTable } from 'dexie';
import type { Capability, Resource, Skill } from '../types/models';

export const SCHEMA_VERSION = 3;

export class ForgeDatabase extends Dexie {
  skills!: EntityTable<Skill, 'id'>;
  resources!: EntityTable<Resource, 'id'>;
  capabilities!: EntityTable<Capability, 'id'>;

  constructor(name = 'forge') {
    super(name);

    // Initial vertical-slice schema. Retained so databases created by early builds upgrade safely.
    this.version(1).stores({
      skills: 'id, name, category, archived, updatedAt',
      resources: 'id, name, category, resourceType, archived, updatedAt',
      capabilities: 'id, name, category, status, archived, updatedAt',
      actions: 'id, title, category, status, completedAt, archived, updatedAt',
      knowledgeEntries: 'id, title, category, verificationStatus, archived, updatedAt',
      profiles: 'id',
    });

    // V2 narrows the application to the first vertical slice and normalizes legacy records.
    this.version(2)
      .stores({
        skills: 'id, name, category, archived, updatedAt, *tags',
        resources: 'id, name, category, resourceType, archived, updatedAt, *tags',
        capabilities: null,
        actions: null,
        knowledgeEntries: null,
        profiles: null,
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Skill>('skills')
          .toCollection()
          .modify((skill) => {
            skill.tags ??= [];
            skill.archived ??= false;
            skill.confidence ??= 50;
            skill.evidenceNotes ??= '';
            skill.evidenceLinks ??= [];
          });
        await transaction
          .table<Resource>('resources')
          .toCollection()
          .modify((resource) => {
            resource.tags ??= [];
            resource.archived ??= false;
            resource.notes ??= '';
          });
      });

    // V3 adds capabilities as references to existing skills and resources.
    this.version(3).stores({
      skills: 'id, name, category, archived, updatedAt, *tags',
      resources: 'id, name, category, resourceType, archived, updatedAt, *tags',
      capabilities: 'id, name, category, archived, updatedAt, *tags',
    });
  }
}

export const db = new ForgeDatabase();
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const baseRecord = () => ({
  id: uid(),
  createdAt: now(),
  updatedAt: now(),
  tags: [] as string[],
  archived: false,
});
