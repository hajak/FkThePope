import { describe, it, expect } from 'vitest';
import { getLegalMoves, isLegalPlay } from './legal-moves.js';
import type { Card, PlayedCard } from '@fkthepope/shared';

describe('getLegalMoves', () => {
  const hand: Card[] = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'hearts', rank: '5' },
    { suit: 'spades', rank: 'K' },
    { suit: 'diamonds', rank: '7' },
    { suit: 'clubs', rank: 'Q' },
  ];

  it('should allow any card when leading', () => {
    const moves = getLegalMoves(hand, [], 'spades');
    expect(moves.length).toBe(5);
    expect(moves.every((m) => m.canPlayFaceUp)).toBe(true);
    expect(moves.every((m) => !m.canPlayFaceDown)).toBe(true);
  });

  it('should restrict to lead suit when player has it', () => {
    const trickCards: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '3' }, playedBy: 'north', faceDown: false, playedAt: 0 },
    ];

    const moves = getLegalMoves(hand, trickCards, 'spades');
    expect(moves.length).toBe(2); // Two hearts
    expect(moves.every((m) => m.card.suit === 'hearts')).toBe(true);
    expect(moves.every((m) => m.canPlayFaceUp)).toBe(true);
    expect(moves.every((m) => !m.canPlayFaceDown)).toBe(true);
  });

  it('should allow any card (face-up or face-down) when void in lead suit', () => {
    const trickCards: PlayedCard[] = [
      { card: { suit: 'clubs', rank: '3' }, playedBy: 'north', faceDown: false, playedAt: 0 },
    ];

    // Hand has only one club
    const voidHand: Card[] = [
      { suit: 'hearts', rank: 'A' },
      { suit: 'spades', rank: 'K' },
      { suit: 'diamonds', rank: '7' },
    ];

    const moves = getLegalMoves(voidHand, trickCards, 'spades');
    expect(moves.length).toBe(3);
    expect(moves.every((m) => m.canPlayFaceUp)).toBe(true);
    expect(moves.every((m) => m.canPlayFaceDown)).toBe(true);
  });

  it('should handle empty hand', () => {
    const moves = getLegalMoves([], [], 'spades');
    expect(moves.length).toBe(0);
  });
});

describe('isLegalPlay', () => {
  const hand: Card[] = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'hearts', rank: '5' },
    { suit: 'spades', rank: 'K' },
  ];

  it('should reject card not in hand', () => {
    const result = isLegalPlay(
      { suit: 'clubs', rank: 'Q' },
      false,
      hand,
      [],
      'spades'
    );
    expect(result.legal).toBe(false);
    expect(result.reason).toContain('not in your hand');
  });

  it('should reject face-down play when leading', () => {
    const result = isLegalPlay(hand[0]!, true, hand, [], 'spades');
    expect(result.legal).toBe(false);
    expect(result.reason).toContain('Cannot discard when leading');
  });

  it('should allow face-up lead', () => {
    const result = isLegalPlay(hand[0]!, false, hand, [], 'spades');
    expect(result.legal).toBe(true);
  });

  it('should reject non-lead-suit when player has lead suit', () => {
    const trickCards: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '3' }, playedBy: 'north', faceDown: false, playedAt: 0 },
    ];

    const result = isLegalPlay(
      { suit: 'spades', rank: 'K' },
      false,
      hand,
      trickCards,
      'spades'
    );
    expect(result.legal).toBe(false);
    expect(result.reason).toContain('Must follow suit');
  });

  it('should allow lead-suit card', () => {
    const trickCards: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '3' }, playedBy: 'north', faceDown: false, playedAt: 0 },
    ];

    const result = isLegalPlay(hand[0]!, false, hand, trickCards, 'spades');
    expect(result.legal).toBe(true);
  });

  it('should reject face-down when following suit', () => {
    const trickCards: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '3' }, playedBy: 'north', faceDown: false, playedAt: 0 },
    ];

    const result = isLegalPlay(hand[0]!, true, hand, trickCards, 'spades');
    expect(result.legal).toBe(false);
    expect(result.reason).toContain('Cannot discard when following suit');
  });

  it('should allow trump when void in lead suit', () => {
    const voidHand: Card[] = [{ suit: 'spades', rank: 'K' }];
    const trickCards: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '3' }, playedBy: 'north', faceDown: false, playedAt: 0 },
    ];

    const result = isLegalPlay(voidHand[0]!, false, voidHand, trickCards, 'spades');
    expect(result.legal).toBe(true);
  });

  it('should allow face-down discard when void', () => {
    const voidHand: Card[] = [{ suit: 'diamonds', rank: '7' }];
    const trickCards: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '3' }, playedBy: 'north', faceDown: false, playedAt: 0 },
    ];

    const result = isLegalPlay(voidHand[0]!, true, voidHand, trickCards, 'spades');
    expect(result.legal).toBe(true);
  });
});
