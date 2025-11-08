import Fastify from 'fastify';
import { PersonaService } from './service';
import { CharacterStatus, CharacterVisibility } from '@jani/shared';

const fastify = Fastify({ logger: true });
const persona = new PersonaService();

fastify.get('/persona/characters', async () => {
  return persona.list();
});

fastify.post('/persona/characters', async (request, reply) => {
  const body = request.body as {
    slug: string;
    name: string;
    visibility: CharacterVisibility;
    status: CharacterStatus;
    systemPrompt: string;
  };
  const character = persona.create(body);
  return reply.code(201).send(character);
});

fastify.patch('/persona/characters/:id', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const patch = request.body as Partial<{ name: string; visibility: CharacterVisibility; status: CharacterStatus }>;
  const character = persona.update(id, patch);
  return reply.send(character);
});

fastify.post('/persona/characters/:id/stories', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const body = request.body as { title: string; arcJson: Record<string, unknown>; isPremium: boolean };
  const story = persona.addStory(id, body);
  return reply.code(201).send(story);
});

fastify.post('/persona/characters/:id/versions', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const body = request.body as { systemPrompt: string; isActive?: boolean };
  const character = persona.addVersion(id, body);
  return reply.send(character);
});

fastify.listen({ port: 3040, host: '0.0.0.0' }).catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
