import { z } from 'zod';
import { PLAYER_POSITIONS, SUITS, RANKS } from '@fkthepope/shared';

// Card schema
export const CardSchema = z.object({
  suit: z.enum(['hearts', 'diamonds', 'clubs', 'spades']),
  rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']),
});

// Player position schema
export const PlayerPositionSchema = z.enum(['north', 'east', 'south', 'west']);

// Rule predicate schemas (recursive)
const BaseCardPredicateSchema = z.object({
  type: z.literal('card'),
  target: z.enum(['played', 'led', 'winning', 'hand']),
});

const CardMatcherSchema = z.object({
  suit: z.enum(['hearts', 'diamonds', 'clubs', 'spades', 'trump', 'lead', 'any']).optional(),
  rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'any']).optional(),
  color: z.enum(['red', 'black']).optional(),
});

const CardPredicateSchema = BaseCardPredicateSchema.extend({
  matches: CardMatcherSchema,
});

const PlayerPredicateSchema = z.object({
  type: z.literal('player'),
  target: z.enum(['current', 'leader', 'any']),
  matches: z.object({
    position: PlayerPositionSchema.optional(),
    isDealer: z.boolean().optional(),
  }),
});

const TrickPredicateSchema = z.object({
  type: z.literal('trick'),
  condition: z.enum(['isFirst', 'isLast', 'numberEquals', 'numberGreaterThan', 'numberLessThan']),
  value: z.number().optional(),
});

// Simplified predicate schema (not fully recursive for performance)
export const RulePredicateSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('type', [
    CardPredicateSchema,
    PlayerPredicateSchema,
    TrickPredicateSchema,
    z.object({
      type: z.literal('and'),
      conditions: z.array(z.lazy(() => RulePredicateSchema)),
    }),
    z.object({
      type: z.literal('or'),
      conditions: z.array(z.lazy(() => RulePredicateSchema)),
    }),
    z.object({
      type: z.literal('not'),
      condition: z.lazy(() => RulePredicateSchema),
    }),
    z.object({
      type: z.literal('always'),
    }),
  ])
);

// Rule effect schema
export const RuleEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('forbidPlay'),
    message: z.string().max(200),
  }),
  z.object({
    type: z.literal('requirePlay'),
    cardMatcher: CardMatcherSchema,
    message: z.string().max(200),
  }),
  z.object({
    type: z.literal('skipNextPlayer'),
  }),
  z.object({
    type: z.literal('forceDiscard'),
  }),
]);

// Rule schema (for creation - without server-generated fields)
export const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  event: z.enum(['onPlayAttempt', 'onPlayAccepted', 'onTrickEnd', 'onHandEnd']),
  when: RulePredicateSchema,
  then: z.array(RuleEffectSchema).min(1).max(5),
});

// Socket event data schemas
export const JoinLobbySchema = z.object({
  playerName: z.string().min(1).max(50).trim(),
});

export const CreateRoomSchema = z.object({
  roomName: z.string().min(1).max(50).trim(),
});

export const JoinRoomSchema = z.object({
  roomId: z.string().min(1),
  position: PlayerPositionSchema.optional(),
});

export const PlayCardSchema = z.object({
  card: CardSchema,
  faceDown: z.boolean(),
});

export const CreateRuleEventSchema = z.object({
  rule: CreateRuleSchema,
});

export const AddBotSchema = z.object({
  position: PlayerPositionSchema,
});

export const RemoveBotSchema = z.object({
  position: PlayerPositionSchema,
});

// Validation helper
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorMessage = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
  return { success: false, error: errorMessage };
}
