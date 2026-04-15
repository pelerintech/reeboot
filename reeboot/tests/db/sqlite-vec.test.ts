import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { loadVecExtension } from '../../src/db/index.js';

describe('sqlite-vec extension loading', () => {
  it('creating vec0 virtual table fails without extension loaded', () => {
    const db = new Database(':memory:');
    // vec0 is unavailable without the extension — expect an error
    expect(() => {
      db.exec(`CREATE VIRTUAL TABLE test_vec USING vec0(embedding float[4])`);
    }).toThrow();
    db.close();
  });

  it('loads sqlite-vec extension and creates vec0 virtual table', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);

    // After loading, vec0 creation should succeed
    expect(() => {
      db.exec(`CREATE VIRTUAL TABLE test_vec USING vec0(embedding float[4])`);
    }).not.toThrow();

    db.close();
  });

  it('runs a KNN query against vec0 table after extension is loaded', () => {
    const db = new Database(':memory:');
    loadVecExtension(db);

    db.exec(`CREATE VIRTUAL TABLE knn_test USING vec0(embedding float[3])`);

    // Insert a vector (sqlite-vec expects Buffer, not ArrayBuffer)
    const vec = new Float32Array([0.1, 0.2, 0.3]);
    const buf = Buffer.from(vec.buffer);
    db.prepare(`INSERT INTO knn_test (rowid, embedding) VALUES (1, ?)`).run(buf);

    // KNN query — should work without error
    const results = db
      .prepare(`SELECT rowid FROM knn_test WHERE embedding MATCH ? ORDER BY distance LIMIT 1`)
      .all(buf);

    expect(results.length).toBe(1);
    expect((results[0] as { rowid: number }).rowid).toBe(1);

    db.close();
  });
});
