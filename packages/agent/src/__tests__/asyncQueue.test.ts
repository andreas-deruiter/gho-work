import { describe, it, expect } from 'vitest';
import { AsyncQueue } from '../common/asyncQueue.js';

describe('AsyncQueue', () => {
  it('yields items pushed before iteration', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.end();

    const results: number[] = [];
    for await (const item of queue) {
      results.push(item);
    }
    expect(results).toEqual([1, 2]);
  });

  it('yields items pushed during iteration', async () => {
    const queue = new AsyncQueue<number>();
    const results: number[] = [];

    const consumer = (async () => {
      for await (const item of queue) {
        results.push(item);
      }
    })();

    queue.push(10);
    queue.push(20);
    queue.end();

    await consumer;
    expect(results).toEqual([10, 20]);
  });

  it('throws error in consumer when error is pushed', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.error(new Error('test error'));

    const results: number[] = [];
    await expect(async () => {
      for await (const item of queue) {
        results.push(item);
      }
    }).rejects.toThrow('test error');
    expect(results).toEqual([1]);
  });

  it('returns immediately when already ended', async () => {
    const queue = new AsyncQueue<string>();
    queue.end();

    const results: string[] = [];
    for await (const item of queue) {
      results.push(item);
    }
    expect(results).toEqual([]);
  });
});
