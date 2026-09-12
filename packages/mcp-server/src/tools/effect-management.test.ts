import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from '../../../foundry-module/src/data-access.js';
import { EffectManagementTools } from './effect-management.js';

function makeEffect(id: string, name: string, data: Record<string, any> = {}) {
  let source = { _id: id, name, ...data };
  const effect: any = {
    id,
    name,
    ...data,
    toObject: vi.fn(() => ({ ...source })),
    applyUpdate(update: Record<string, any>) {
      source = { ...source, ...update, _id: id };
      Object.assign(effect, update, { id });
    },
  };
  return effect;
}

function makeCollection(documents: any[]) {
  return {
    contents: documents,
    get: vi.fn((id: string) => documents.find(document => document.id === id)),
    find: vi.fn((predicate: (document: any) => boolean) => documents.find(predicate)),
  };
}

function addEffectMethods(parent: any) {
  parent.createEmbeddedDocuments = vi.fn(
    async (documentName: string, effectData: Record<string, any>[]) => {
      const created = makeEffect('created-effect-id', effectData[0].name, effectData[0]);
      parent.effects.contents.push(created);
      return [created];
    }
  );
  parent.updateEmbeddedDocuments = vi.fn(
    async (documentName: string, updates: Record<string, any>[]) => {
      const effect = parent.effects.get(updates[0]._id);
      effect.applyUpdate(updates[0]);
      return [effect];
    }
  );
  parent.deleteEmbeddedDocuments = vi.fn(async (documentName: string, effectIds: string[]) => {
    const index = parent.effects.contents.findIndex((effect: any) => effect.id === effectIds[0]);
    if (index >= 0) parent.effects.contents.splice(index, 1);
    return [];
  });
  return parent;
}

function makeFixture() {
  const actorEffect = makeEffect('actor-effect-id', 'Actor Effect', {
    disabled: false,
    description: 'Actor effect description',
  });
  const itemEffect = makeEffect('x9OMIlFjG5VoBsis', 'MCP Test Effect', {
    disabled: false,
    description: 'Preserved description',
  });
  const item = addEffectMethods({
    id: 'KYgn8Ax3JVmCb3WL',
    name: 'MCP Test Feature',
    effects: makeCollection([itemEffect]),
  });
  const actor = addEffectMethods({
    id: 'YZk06eI9NHTN9PuN',
    name: 'MCP Test Actor',
    effects: makeCollection([actorEffect]),
    items: makeCollection([item]),
  });
  const actors = makeCollection([actor]);

  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'test-world' },
    user: { id: 'gm', isGM: true },
    actors,
  });

  return { actor, actorEffect, item, itemEffect };
}

function makeDataAccess() {
  return new FoundryDataAccess();
}

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const tools = new EffectManagementTools({ foundryClient: { query } as any, logger });
  return { tools, query };
}

beforeEach(() => {
  vi.stubGlobal('Hooks', { on: vi.fn() });
});

describe('FoundryDataAccess.manageEffects', () => {
  it('creates an Actor-owned effect through the Actor embedded-document API', async () => {
    const { actor } = makeFixture();
    const effectData = {
      name: 'Actor Aura',
      disabled: false,
      changes: [{ key: 'system.attributes.ac.bonus', value: '1' }],
    };

    const result = await makeDataAccess().manageEffects({
      action: 'create',
      actorIdentifier: 'mcp test actor',
      parentType: 'actor',
      effectData,
    });

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [effectData]);
    expect(result).toMatchObject({
      success: true,
      action: 'create',
      entityType: 'effect',
      scope: 'actor',
      effect: { name: 'Actor Aura', changes: effectData.changes },
    });
  });

  it('creates an Item-owned effect through the Item embedded-document API', async () => {
    const { actor, item } = makeFixture();
    const effectData = { name: 'Item Aura', transfer: true };

    const result = await makeDataAccess().manageEffects({
      action: 'create',
      actorIdentifier: actor.id,
      parentType: 'item',
      parentItemIdentifier: 'mcp test feature',
      effectData,
    });

    expect(item.createEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [effectData]);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      action: 'create',
      scope: 'item',
      parentItemId: item.id,
      parentItemName: item.name,
      effect: { name: 'Item Aura', transfer: true },
    });
  });

  it('updates only supplied fields on an Item-owned effect', async () => {
    const { actor, item, itemEffect } = makeFixture();

    const result = await makeDataAccess().manageEffects({
      action: 'update',
      actorIdentifier: actor.id,
      parentType: 'item',
      parentItemIdentifier: item.id,
      effectId: itemEffect.id,
      effectData: { disabled: true },
    });

    expect(item.updateEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [
      { _id: itemEffect.id, disabled: true },
    ]);
    expect(result.effect).toMatchObject({
      _id: itemEffect.id,
      name: 'MCP Test Effect',
      disabled: true,
      description: 'Preserved description',
    });
  });

  it('deletes an Item-owned effect and returns its captured metadata', async () => {
    const { actor, item, itemEffect } = makeFixture();

    const result = await makeDataAccess().manageEffects({
      action: 'delete',
      actorIdentifier: actor.id,
      parentType: 'item',
      parentItemIdentifier: item.id,
      effectId: itemEffect.id,
    });

    expect(item.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [itemEffect.id]);
    expect(result).toMatchObject({
      success: true,
      action: 'delete',
      entityType: 'effect',
      effectId: itemEffect.id,
      effectName: itemEffect.name,
      scope: 'item',
      parentItemId: item.id,
      parentItemName: item.name,
    });
  });

  it('updates and deletes Actor-owned effects through Actor APIs', async () => {
    const { actor, actorEffect } = makeFixture();
    const dataAccess = makeDataAccess();

    const updated = await dataAccess.manageEffects({
      action: 'update',
      actorIdentifier: actor.id,
      parentType: 'actor',
      effectId: actorEffect.id,
      effectData: { disabled: true },
    });
    const deleted = await dataAccess.manageEffects({
      action: 'delete',
      actorIdentifier: actor.id,
      parentType: 'actor',
      effectId: actorEffect.id,
    });

    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [
      { _id: actorEffect.id, disabled: true },
    ]);
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', [actorEffect.id]);
    expect(updated).toMatchObject({ action: 'update', scope: 'actor' });
    expect(deleted).toMatchObject({ action: 'delete', scope: 'actor' });
  });

  it('does not mutate an Item-owned effect through the Actor parent', async () => {
    const { actor, item, itemEffect } = makeFixture();

    await expect(
      makeDataAccess().manageEffects({
        action: 'update',
        actorIdentifier: actor.id,
        parentType: 'actor',
        effectId: itemEffect.id,
        effectData: { disabled: true },
      })
    ).rejects.toThrow(`ActiveEffect ${itemEffect.id} not found on actor`);

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('fails clearly when the requested Item parent does not exist', async () => {
    const { actor } = makeFixture();

    await expect(
      makeDataAccess().manageEffects({
        action: 'create',
        actorIdentifier: actor.id,
        parentType: 'item',
        parentItemIdentifier: 'Missing Item',
        effectData: { name: 'Effect' },
      })
    ).rejects.toThrow('Item not found on actor "MCP Test Actor": Missing Item');
  });
});

describe('EffectManagementTools', () => {
  it('exposes manage-effects and forwards valid input to the exact bridge query', async () => {
    const { tools, query } = makeTools();
    const [definition] = tools.getToolDefinitions();
    const args = {
      action: 'update',
      actorIdentifier: 'MCP Test Actor',
      parentType: 'item',
      parentItemIdentifier: 'KYgn8Ax3JVmCb3WL',
      effectId: 'x9OMIlFjG5VoBsis',
      effectData: { disabled: true },
    };

    const result = await tools.handleManageEffects(args);

    expect(definition.name).toBe('manage-effects');
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.manageEffects', args);
    expect(result.success).toBe(true);
  });

  it.each([
    {
      name: 'an Item parent without parentItemIdentifier',
      args: {
        action: 'create',
        actorIdentifier: 'Actor',
        parentType: 'item',
        effectData: { name: 'Effect' },
      },
      error: 'parentItemIdentifier is required',
    },
    {
      name: 'create without an effect name',
      args: {
        action: 'create',
        actorIdentifier: 'Actor',
        parentType: 'actor',
        effectData: { disabled: false },
      },
      error: 'effectData.name is required',
    },
    {
      name: 'update without effectId',
      args: {
        action: 'update',
        actorIdentifier: 'Actor',
        parentType: 'actor',
        effectData: { disabled: true },
      },
      error: 'effectId is required for update',
    },
    {
      name: 'update with empty effectData',
      args: {
        action: 'update',
        actorIdentifier: 'Actor',
        parentType: 'actor',
        effectId: 'effect-id',
        effectData: {},
      },
      error: 'effectData is required for update and must contain at least one field',
    },
    {
      name: 'delete without effectId',
      args: { action: 'delete', actorIdentifier: 'Actor', parentType: 'actor' },
      error: 'effectId is required for delete',
    },
    {
      name: 'an update with a conflicting embedded ID',
      args: {
        action: 'update',
        actorIdentifier: 'Actor',
        parentType: 'actor',
        effectId: 'effect-id',
        effectData: { _id: 'different-id' },
      },
      error: 'effectData._id must match effectId',
    },
    {
      name: 'an update with a conflicting public ID',
      args: {
        action: 'update',
        actorIdentifier: 'Actor',
        parentType: 'actor',
        effectId: 'effect-id',
        effectData: { id: 'different-id' },
      },
      error: 'effectData.id must match effectId',
    },
  ])('rejects $name without calling Foundry', async ({ args, error }) => {
    const { tools, query } = makeTools();

    const result = await tools.handleManageEffects(args);

    expect(result.success).toBe(false);
    expect(result.error).toContain(error);
    expect(query).not.toHaveBeenCalled();
  });
});
