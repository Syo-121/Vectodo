import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { defaultTitle, flatten, offsetLabel, stripDatePrefix } from '../src/shared/templates.ts';
import type { Template, TaskDetail } from '../src/shared/types.ts';
import { setup } from './helpers.ts';

/** 「10/18 ブログ」: 親はやる日 10/18。ネタ → 執筆 → 公開（公開の下に孫）、中止した子と外への依存もある */
function blog() {
  const s = setup('2026-10-13');
  const cat = s.categories.create({ name: 'Blog' });
  const other = s.tasks.create({ title: 'ドメイン取得' });
  const p = s.tasks.create({ title: '10/18 ブログ', categoryId: cat.id, doDates: [{ date: '2026-10-18' }] });
  const a = s.tasks.create({ title: 'ネタ', parentId: p.id, estimateMin: 30, notes: '候補を3つ' });
  const b = s.tasks.create({
    title: '執筆',
    parentId: p.id,
    priority: 1,
    doDates: [{ date: '2026-10-15', minutes: 120 }],
    dueDate: '2026-10-16',
    dueTime: '21:00',
    dependsOn: [a.id],
  });
  const c = s.tasks.create({ title: '公開', parentId: p.id, dependsOn: [b.id, other.id] });
  s.tasks.create({ title: 'X で告知', parentId: c.id });
  const x = s.tasks.create({ title: 'やめた工程', parentId: p.id });
  s.tasks.update(x.id, { status: 'canceled' });
  return { ...s, cat, p, a, b, c };
}

describe('テンプレート（design 4-8）', () => {
  it('保存: 子・孫・中の依存・見積・メモを写し、日付は親のやる日からの日数で覚える（中止の子と外への依存は入れない）', () => {
    const { templates, p, cat } = blog();
    const t = templates.saveFromTask(p.id, 'ブログ');
    const { root, deps, anchor, datePrefix } = t.body;
    expect([anchor, datePrefix, root.title]).toEqual(['do', true, 'ブログ']);
    expect(root.doOffsets).toEqual([{ offset: 0, minutes: null }]);
    expect(flatten(root).map(({ node, depth }) => `${depth}:${node.title}`)).toEqual([
      '0:ブログ',
      '1:ネタ',
      '1:執筆',
      '1:公開',
      '2:X で告知',
    ]);
    const [, neta, shippitsu] = flatten(root).map((x) => x.node);
    expect(neta).toMatchObject({ estimateMin: 30, notes: '候補を3つ', categoryId: cat.id });
    expect(shippitsu).toMatchObject({
      priority: 1,
      doOffsets: [{ offset: -3, minutes: 120 }],
      dueOffset: -2,
      dueTime: '21:00',
    });
    expect(deps).toHaveLength(2); // ネタ→執筆・執筆→公開（ドメイン取得への線は外なので入れない）
  });

  it('適用: 基準日から逆算して日付を入れ、依存を張り直し、タイトルに M/D を付ける', () => {
    const { templates, tasks, p, cat } = blog();
    const t = templates.saveFromTask(p.id, 'ブログ');
    const made = templates.apply('ブログ', { date: '2026-10-25' });
    expect(made.title).toBe('10/25 ブログ');
    expect(made.categoryId).toBe(cat.id);
    expect(made.doDates).toEqual([{ date: '2026-10-25', minutes: null, start: null }]);
    expect(made.childTasks.map((c) => c.title)).toEqual(['ネタ', '執筆', '公開']);
    const [neta, shippitsu, kokai] = made.childTasks as TaskDetail['childTasks'];
    expect(shippitsu!.doDates).toEqual([{ date: '2026-10-22', minutes: 120, start: null }]);
    expect([shippitsu!.dueDate, shippitsu!.dueTime]).toEqual(['2026-10-23', '21:00']);
    expect(shippitsu!.dependsOn.map((d) => d.id)).toEqual([neta!.id]);
    expect(kokai!.dependsOn.map((d) => d.id)).toEqual([shippitsu!.id]);
    expect(tasks.get(kokai!.id).childTasks.map((c) => c.title)).toEqual(['X で告知']);
    expect(made.descendantCount).toBe(4);
    expect(made.childTasks.every((c) => c.status === 'todo')).toBe(true);
    expect(t.sourceTaskId).toBe(p.id);
  });

  it('適用: 基準日なしなら日付を入れない・タイトルは指定できる・アーカイブしたカテゴリは「なし」にする', () => {
    const { templates, categories, p, cat } = blog();
    const t = templates.saveFromTask(p.id, 'ブログ');
    const plain = templates.apply(t.id);
    expect(plain.title).toBe('ブログ');
    expect(plain.doDates).toEqual([]);
    expect(plain.childTasks.every((c) => c.doDates.length === 0 && c.dueDate === null)).toBe(true);

    categories.update(cat.id, { archived: true });
    const named = templates.apply(t.id, { title: '特別号', date: '2026-11-01' });
    expect(named.title).toBe('特別号');
    expect(named.categoryId).toBeNull();
  });

  it('名前: 同じ名前は断り、上書きなら中身を置き換える・名前の変更と削除', () => {
    const { templates, tasks, p, a } = blog();
    const first = templates.saveFromTask(p.id, 'ブログ');
    expect(() => templates.saveFromTask(a.id, 'ブログ')).toThrow(/既にある/);
    const replaced = templates.saveFromTask(a.id, 'ブログ', true);
    expect(replaced.id).toBe(first.id);
    expect(flatten(replaced.body.root)).toHaveLength(1);
    expect(replaced.body.anchor).toBeNull();

    templates.saveFromTask(p.id, '別');
    expect(() => templates.rename(first.id, '別')).toThrow(/既にある/);
    expect(templates.rename(first.id, '短い').name).toBe('短い');
    templates.delete(first.id);
    expect(templates.list().map((x) => x.name)).toEqual(['別']);
    expect(() => templates.apply('短い')).toThrow(/見つからない/);
    expect(tasks.get(p.id).childTasks).toHaveLength(4); // 元のタスクはそのまま
  });

  it('小さな関数: 日付の外し方・付け方・日数の言い方', () => {
    expect(stripDatePrefix('10/18 ブログ')).toEqual({ title: 'ブログ', datePrefix: true });
    expect(stripDatePrefix('10/18')).toEqual({ title: '10/18', datePrefix: false });
    expect(stripDatePrefix('週報')).toEqual({ title: '週報', datePrefix: false });
    const body = { root: { title: 'ブログ' }, datePrefix: true } as Template['body'];
    expect(defaultTitle(body, '2026-01-05')).toBe('1/5 ブログ');
    expect(defaultTitle(body, null)).toBe('ブログ');
    expect([offsetLabel(0), offsetLabel(-3), offsetLabel(2)]).toEqual(['基準日', '3日前', '2日後']);
  });

  it('API と MCP: 保存（重複は 409）→ 一覧 → 適用、AI は名前で適用できる', async () => {
    const s = blog();
    const app = createApp(s, { allowedHosts: ['localhost'] });
    const H = { host: 'localhost:5180', 'content-type': 'application/json' };
    const post = (path: string, body: unknown) =>
      app.request(path, { method: 'POST', headers: H, body: JSON.stringify(body) });

    const saved = await post('/api/templates', { taskId: s.p.code, name: 'ブログ' });
    expect(saved.status).toBe(201);
    expect((await post('/api/templates', { taskId: s.p.id, name: 'ブログ' })).status).toBe(409);
    const list = (await (await app.request('/api/templates', { headers: H })).json()) as Template[];
    const applied = await post(`/api/templates/${list[0]!.id}/apply`, { date: '2026-10-25' });
    expect(applied.status).toBe(201);
    expect(((await applied.json()) as TaskDetail).title).toBe('10/25 ブログ');

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { ...H, accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'apply_template', arguments: { template: 'ブログ', date: '2026-11-01' } },
      }),
    });
    const out = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(out.result.isError).toBeFalsy();
    expect(out.result.content[0]!.text).toContain('11/1 ブログ');
    const listed = await app.request('/mcp', {
      method: 'POST',
      headers: { ...H, accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_templates', arguments: {} } }),
    });
    const text = ((await listed.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text;
    expect(text).toContain('ブログ（5件・依存2本・基準日=親のやる日・親のタイトルに日付を付ける）');
    expect(text).toContain('執筆 [Blog] 締切 2日前 21:00 やる日 3日前(2h) 優先:高');
  });
});
