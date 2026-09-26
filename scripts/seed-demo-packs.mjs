#!/usr/bin/env node
/**
 * Seed distinguishable demo story packs for Sales OS internal trial.
 *
 * Usage:
 *   node scripts/seed-demo-packs.mjs --pack=all
 *   node scripts/seed-demo-packs.mjs --pack=tele|b2b|finance
 *
 * Idempotent on merge_key / script title / dial task name prefixes.
 * Credentials/passwords are NOT printed. Reads DATABASE_URL from .env / .env.native.
 *
 * Packs:
 *   A tele  — 电销班：公海线索多、外呼任务包、通话 MOCK、话术
 *   B b2b   — B2B跟进：私海案件、跟进待办、预约
 *   C finance — 成交回款：WON+合同+回款计划/部分实收/逾期
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const map = Object.create(null);
  for (const name of ['.env', '.env.native']) {
    const fp = path.join(ROOT, name);
    if (!fs.existsSync(fp)) continue;
    for (const line of fs.readFileSync(fp, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in map)) map[k] = v;
    }
  }
  return map;
}

const env = loadEnv();
const DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL
  || `postgres://${env.POSTGRES_USER || 'sales'}:${env.POSTGRES_PASSWORD || 'sales'}@127.0.0.1:${env.NATIVE_PG_PORT || '5432'}/${env.POSTGRES_DB || 'sales_os'}`;

function argPack() {
  const a = process.argv.find((x) => x.startsWith('--pack='));
  const v = (a ? a.slice('--pack='.length) : process.env.DEMO_PACK || 'all').toLowerCase();
  if (!['all', 'tele', 'b2b', 'finance'].includes(v)) {
    console.error('Invalid --pack. Use all|tele|b2b|finance');
    process.exit(2);
  }
  return v;
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const hoursFromNow = (h) => new Date(Date.now() + h * 3600000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);

async function ensureTenant(client) {
  let r = await client.query(`SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1`);
  if (r.rows[0]) return r.rows[0].id;
  r = await client.query(`SELECT id FROM tenants WHERE name = '演示销售公司' LIMIT 1`);
  if (r.rows[0]) return r.rows[0].id;
  const id = randomUUID();
  await client.query(
    `INSERT INTO tenants (id, name, slug, mode_flags, timezone, locale, created_at)
     VALUES ($1, '演示销售公司', 'demo', '{LEAD_INBOUND,HYBRID}', 'Asia/Shanghai', 'zh-CN', now())`,
    [id],
  );
  return id;
}

async function userSeat(client, tenantId, email) {
  const u = await client.query(
    `SELECT u.id AS user_id, s.id AS seat_id FROM users u
     LEFT JOIN agent_seats s ON s.user_id = u.id AND s.tenant_id = u.tenant_id
     WHERE u.tenant_id = $1 AND u.email = $2 LIMIT 1`,
    [tenantId, email],
  );
  if (!u.rows[0]) throw new Error(`Missing seed user ${email} — run npm run seed first`);
  return u.rows[0];
}

async function ensurePoolRules(client, tenantId) {
  const r = await client.query(`SELECT id FROM pool_rules WHERE tenant_id = $1`, [tenantId]);
  if (r.rows[0]) return;
  await client.query(
    `INSERT INTO pool_rules (id, tenant_id, max_private_cases, protect_hours, idle_days_to_recycle, enabled, created_at, updated_at)
     VALUES ($1, $2, 50, 48, 7, true, now(), now())`,
    [randomUUID(), tenantId],
  );
}

async function upsertIdentity(client, tenantId, { phone, name, company, email }) {
  const mergeKey = `phone:${phone}`;
  const found = await client.query(
    `SELECT id FROM lead_identities WHERE tenant_id = $1 AND merge_key = $2`,
    [tenantId, mergeKey],
  );
  if (found.rows[0]) {
    await client.query(
      `UPDATE lead_identities SET name = $2, company_name = $3, email = COALESCE($4, email) WHERE id = $1`,
      [found.rows[0].id, name, company, email || null],
    );
    return found.rows[0].id;
  }
  const id = randomUUID();
  await client.query(
    `INSERT INTO lead_identities (id, tenant_id, phone, wechat_id, email, name, company_name, merge_key, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, now())`,
    [id, tenantId, phone, email || null, name, company, mergeKey],
  );
  return id;
}

async function upsertCase(client, tenantId, {
  identityId, pack, stage, sea, product, ownerSeatId, nextFollowAt, followStatus,
  lastTouchAt, protectedUntil, companyTag,
}) {
  // Find existing demo case for this identity+pack
  const found = await client.query(
    `SELECT id FROM lead_cases WHERE tenant_id = $1 AND identity_id = $2
       AND (flags->>'demo_pack') = $3 LIMIT 1`,
    [tenantId, identityId, pack],
  );
  const flags = JSON.stringify({
    demo_pack: pack,
    demo_label: companyTag || pack,
    synthetic_fixture: true,
    tags: [pack, 'demo'],
  });
  if (found.rows[0]) {
    await client.query(
      `UPDATE lead_cases SET stage = $2, sea_status = $3, product_code = $4, owner_agent_id = $5,
        next_follow_at = $6, follow_up_status = $7, last_touch_at = $8, protected_until = $9,
        flags = $10::jsonb, updated_at = now()
       WHERE id = $1`,
      [
        found.rows[0].id, stage, sea, product, ownerSeatId || null,
        nextFollowAt || null, followStatus || null, lastTouchAt || new Date(),
        protectedUntil || null, flags,
      ],
    );
    return found.rows[0].id;
  }
  const id = randomUUID();
  const srcId = randomUUID();
  await client.query(
    `INSERT INTO lead_sources (id, tenant_id, type, campaign, product_code, utm_source, utm_campaign, created_at)
     VALUES ($1, $2, 'synthetic_fixture', $3, $4, 'demo_pack', $3, now())`,
    [srcId, tenantId, `demo_${pack}`, product],
  );
  await client.query(
    `INSERT INTO lead_cases (
       id, tenant_id, identity_id, source_id, scene_id, product_code, path, stage,
       owner_agent_id, flags, intent_level, intent_qualified, next_follow_at, follow_up_status,
       sea_status, protected_until, last_touch_at, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,'STANDARD',$7,$8,$9::jsonb,'high',true,$10,$11,$12,$13,$14,now(),now()
     )`,
    [
      id, tenantId, identityId, srcId, `demo:${pack}`, product, stage, ownerSeatId || null, flags,
      nextFollowAt || null, followStatus || null, sea,
      protectedUntil || null, lastTouchAt || new Date(),
    ],
  );
  return id;
}

async function ensurePoolItem(client, tenantId, caseId, reason = 'demo_public') {
  const r = await client.query(
    `SELECT id FROM pool_items WHERE tenant_id = $1 AND case_id = $2 LIMIT 1`,
    [tenantId, caseId],
  );
  if (r.rows[0]) {
    await client.query(
      `UPDATE pool_items SET status = 'open', reason = $2, claimable_from = now() WHERE id = $1`,
      [r.rows[0].id, reason],
    );
    return;
  }
  await client.query(
    `INSERT INTO pool_items (id, tenant_id, case_id, reason, claimable_from, last_owner_id, status, created_at)
     VALUES ($1, $2, $3, $4, now(), NULL, 'open', now())`,
    [randomUUID(), tenantId, caseId, reason],
  );
}

async function ensureOwnership(client, tenantId, caseId, seatId) {
  await client.query(
    `UPDATE ownerships SET status = 'released' WHERE tenant_id = $1 AND case_id = $2 AND status = 'active'`,
    [tenantId, caseId],
  );
  await client.query(
    `INSERT INTO ownerships (id, tenant_id, case_id, agent_id, reason, protect_until, status, created_at)
     VALUES ($1, $2, $3, $4, 'demo_pack', $5, 'active', now())`,
    [randomUUID(), tenantId, caseId, seatId, hoursFromNow(48)],
  );
}

async function ensureActivity(client, tenantId, caseId, kind, body, meta = {}) {
  const r = await client.query(
    `SELECT id FROM case_activities WHERE tenant_id = $1 AND case_id = $2 AND kind = $3 AND body = $4 LIMIT 1`,
    [tenantId, caseId, kind, body],
  );
  if (r.rows[0]) return;
  await client.query(
    `INSERT INTO case_activities (id, tenant_id, case_id, actor_user_id, kind, body, meta, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $6::jsonb, now())`,
    [randomUUID(), tenantId, caseId, kind, body, JSON.stringify(meta)],
  );
}

async function seedTele(client, tenantId, seats) {
  const companies = [
    ['13810001001', '张经理', '华东快运演示A'],
    ['13810001002', '李主管', '华南仓储演示B'],
    ['13810001003', '王总', '北方制造演示C'],
    ['13810001004', '赵小姐', '西部零售演示D'],
    ['13810001005', '钱工', '中原物流演示E'],
    ['13810001006', '孙采购', '沿海贸易演示F'],
    ['13810001007', '周店长', '城配驿站演示G'],
    ['13810001008', '吴运营', '跨境电商演示H'],
    ['13810001009', '郑客服', '本地生活演示I'],
    ['13810001010', '冯总监', '教育培训演示J'],
    ['13810001011', '陈顾问', '医疗器械演示K'],
    ['13810001012', '褚经理', '建筑建材演示L'],
  ];
  const caseIds = [];
  for (const [phone, name, company] of companies) {
    const idn = await upsertIdentity(client, tenantId, { phone, name, company });
    const cid = await upsertCase(client, tenantId, {
      identityId: idn,
      pack: 'tele',
      stage: 'NEW',
      sea: 'public',
      product: 'sales-agent',
      ownerSeatId: null,
      lastTouchAt: daysAgo(2),
      companyTag: `电销班·${company}`,
    });
    await ensurePoolItem(client, tenantId, cid, 'demo_tele_public');
    caseIds.push(cid);
  }

  // Scripts
  const scripts = [
    ['开场', '【电销】30秒开场', '您好，我是XX销售，打扰您一分钟：我们帮企业把获客线索接到跟进工作台，今天方便了解一下贵司外呼现状吗？', ['tele', '开场']],
    ['异议', '【电销】价格异议', '理解预算顾虑。我们先做免费演示，确认价值再谈实施范围，不会一上来签大单。', ['tele', '异议']],
    ['邀约', '【电销】预约演示', '那我帮您约个15分钟远程演示，您看明天下午还是后天上午更合适？', ['tele', '邀约']],
  ];
  const scriptIds = [];
  for (const [scene, title, body, tags] of scripts) {
    let r = await client.query(
      `SELECT id FROM sales_scripts WHERE tenant_id = $1 AND title = $2 LIMIT 1`,
      [tenantId, title],
    );
    if (!r.rows[0]) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO sales_scripts (id, tenant_id, scene, title, body, tags, enabled, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, now(), now())`,
        [id, tenantId, scene, title, body, tags, seats.manager.user_id],
      );
      scriptIds.push(id);
    } else scriptIds.push(r.rows[0].id);
  }

  // Dial task
  const taskName = '【演示A·电销班】早班外呼包';
  let task = await client.query(
    `SELECT id FROM dial_tasks WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
    [tenantId, taskName],
  );
  let taskId;
  if (task.rows[0]) {
    taskId = task.rows[0].id;
    await client.query(`DELETE FROM dial_task_items WHERE task_id = $1`, [taskId]);
  } else {
    taskId = randomUUID();
    await client.query(
      `INSERT INTO dial_tasks (id, tenant_id, name, description, created_by, due_at, status, total_items, done_items, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', 0, 0, now(), now())`,
      [taskId, tenantId, taskName, '演示包 A：公海线索外呼', seats.manager.user_id, daysFromNow(3)],
    );
  }
  let done = 0;
  for (let i = 0; i < caseIds.length; i++) {
    const cid = caseIds[i];
    const itemId = randomUUID();
    let status = 'pending';
    let result = null;
    let callId = null;
    if (i < 3) {
      // MOCK call records for first 3
      status = 'done';
      result = i === 0 ? 'connected' : i === 1 ? 'no_answer' : 'callback';
      done += 1;
      callId = randomUUID();
      await client.query(
        `INSERT INTO call_records (id, tenant_id, case_id, dial_item_id, provider, mode, duration_sec, recording_url, result, starred, starred_script_id, meta, created_at)
         VALUES ($1, $2, $3, $4, 'mock', 'mock', $5, $6, $7, $8, $9, $10::jsonb, now())
         ON CONFLICT DO NOTHING`,
        [
          callId, tenantId, cid, itemId,
          30 + i * 15,
          `https://example.invalid/mock-recording/${callId}.mp3`,
          result,
          i === 0,
          i === 0 ? scriptIds[0] : null,
          JSON.stringify({ demo_pack: 'tele', honest: 'MOCK' }),
        ],
      );
      // call_records may not have ON CONFLICT — ignore if insert fails on re-run via delete items
      await ensureActivity(client, tenantId, cid, 'call', `MOCK 外呼结果 ${result}`, {
        call_record_id: callId, demo_pack: 'tele', mode: 'mock',
      });
      if (i === 0 && scriptIds[0]) {
        await client.query(
          `INSERT INTO script_stars (id, tenant_id, call_record_id, script_id, scene, starred_by, note, created_at)
           VALUES ($1, $2, $3, $4, '开场', $5, '演示优秀录音', now())
           ON CONFLICT DO NOTHING`,
          [randomUUID(), tenantId, callId, scriptIds[0], seats.agent.user_id],
        ).catch(async () => {
          // unique on call_record — update skip
          const ex = await client.query(
            `SELECT id FROM script_stars WHERE tenant_id = $1 AND call_record_id = $2`,
            [tenantId, callId],
          );
          if (!ex.rows[0]) {
            await client.query(
              `INSERT INTO script_stars (id, tenant_id, call_record_id, script_id, scene, starred_by, note, created_at)
               VALUES ($1, $2, $3, $4, '开场', $5, '演示优秀录音', now())`,
              [randomUUID(), tenantId, callId, scriptIds[0], seats.agent.user_id],
            );
          }
        });
      }
    }
    await client.query(
      `INSERT INTO dial_task_items (id, tenant_id, task_id, case_id, status, claimed_by_seat_id, claimed_at, result, note, call_record_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())`,
      [
        itemId, tenantId, taskId, cid, status,
        status === 'done' ? seats.agent.seat_id : null,
        status === 'done' ? new Date() : null,
        result, status === 'done' ? 'demo tele MOCK' : null, callId,
      ],
    );
  }
  await client.query(
    `UPDATE dial_tasks SET total_items = $2, done_items = $3, updated_at = now() WHERE id = $1`,
    [taskId, caseIds.length, done],
  );
  return { pack: 'tele', cases: caseIds.length, dial_task: taskId, scripts: scriptIds.length };
}

async function seedB2b(client, tenantId, seats) {
  const rows = [
    ['13810002001', '刘总', '星河科技有限公司', 'ASSIGNED', -2, true],   // overdue follow
    ['13810002002', '何经理', '云启软件', 'ASSIGNED', 4, false],          // due later today-ish
    ['13810002003', '高总监', '北辰咨询', 'REACHING', -1, true],
    ['13810002004', '林女士', '青松教育', 'APPOINTED', 24, false],
    ['13810002005', '徐总', '瀚海医疗', 'ASSIGNED', 2, false],
    ['13810002006', '马工', '极光制造', 'NURTURE', 48, false],
  ];
  // idle recycle candidate (private, last touch old)
  rows.push(['13810002007', '闲置客户', '待回收演示公司', 'ASSIGNED', null, false]);

  const caseIds = [];
  for (let i = 0; i < rows.length; i++) {
    const [phone, name, company, stage, followHours, overdueFlag] = rows[i];
    const idn = await upsertIdentity(client, tenantId, { phone, name, company });
    const owner = i % 2 === 0 ? seats.agent.seat_id : seats.agent2.seat_id;
    const ownerUser = i % 2 === 0 ? seats.agent.user_id : seats.agent2.user_id;
    let nextFollow = null;
    let followStatus = null;
    if (followHours != null) {
      nextFollow = hoursFromNow(followHours);
      followStatus = 'open';
    }
    const isIdle = phone.endsWith('2007');
    const cid = await upsertCase(client, tenantId, {
      identityId: idn,
      pack: 'b2b',
      stage,
      sea: 'private',
      product: 'ai-cs',
      ownerSeatId: owner,
      nextFollowAt: nextFollow,
      followStatus,
      lastTouchAt: isIdle ? daysAgo(20) : daysAgo(1),
      protectedUntil: isIdle ? daysAgo(1) : hoursFromNow(24),
      companyTag: `B2B跟进·${company}`,
    });
    await ensureOwnership(client, tenantId, cid, owner);
    // close any public pool item
    await client.query(
      `UPDATE pool_items SET status = 'claimed' WHERE tenant_id = $1 AND case_id = $2 AND status = 'open'`,
      [tenantId, cid],
    );
    await ensureActivity(client, tenantId, cid, 'note', `【B2B】跟进备注 · ${company}`, {
      demo_pack: 'b2b', next_follow_at: nextFollow, overdue: overdueFlag,
    });
    if (stage === 'APPOINTED') {
      const ap = await client.query(
        `SELECT id FROM appointments WHERE tenant_id = $1 AND case_id = $2 LIMIT 1`,
        [tenantId, cid],
      );
      if (!ap.rows[0]) {
        await client.query(
          `INSERT INTO appointments (
             id, tenant_id, case_id, slot_start, slot_end, location_or_link, product_or_program,
             owner_agent_id, status, valid, amount_hint, cancel_policy, commitment_boundary, created_at, confirmed_at
           ) VALUES (
             $1, $2, $3, $4, $5, '腾讯会议演示', 'ai-cs', $6, 'confirmed', true,
             '咨询免费', '开始前2小时可取消', '演示不等于合同', now(), now()
           )`,
          [randomUUID(), tenantId, cid, hoursFromNow(26), hoursFromNow(27), owner],
        );
      }
    }
    // draft appointment pending confirm for one case
    if (phone.endsWith('2005')) {
      const ap = await client.query(
        `SELECT id FROM appointments WHERE tenant_id = $1 AND case_id = $2 AND status = 'draft' LIMIT 1`,
        [tenantId, cid],
      );
      if (!ap.rows[0]) {
        await client.query(
          `INSERT INTO appointments (
             id, tenant_id, case_id, slot_start, slot_end, location_or_link, product_or_program,
             owner_agent_id, status, valid, amount_hint, cancel_policy, commitment_boundary, created_at, confirmed_at
           ) VALUES (
             $1, $2, $3, $4, $5, '待确认会议室', 'ai-cs', $6, 'draft', false,
             '咨询免费', '开始前2小时可取消', '演示不等于合同', now(), NULL
           )`,
          [randomUUID(), tenantId, cid, hoursFromNow(30), hoursFromNow(31), owner],
        );
        await client.query(`UPDATE lead_cases SET stage = 'APPOINTMENT_PENDING' WHERE id = $1`, [cid]);
      }
    }
    caseIds.push(cid);
  }
  return { pack: 'b2b', cases: caseIds.length };
}

async function seedFinance(client, tenantId, seats) {
  const deals = [
    {
      phone: '13810003001', name: '成交甲', company: '【成交】锦程集团',
      amount: '120000', plans: [
        { due: daysAgo(10), amount: '40000', status: 'paid', receipt: true },
        { due: daysAgo(3), amount: '40000', status: 'overdue', receipt: false },
        { due: daysFromNow(20), amount: '40000', status: 'pending', receipt: false },
      ],
    },
    {
      phone: '13810003002', name: '成交乙', company: '【成交】启明股份',
      amount: '80000', plans: [
        { due: daysAgo(5), amount: '80000', status: 'overdue', receipt: false },
      ],
    },
    {
      phone: '13810003003', name: '成交丙', company: '【成交】远航科技',
      amount: '50000', plans: [
        { due: daysAgo(15), amount: '25000', status: 'paid', receipt: true },
        { due: daysFromNow(15), amount: '25000', status: 'pending', receipt: false },
      ],
    },
  ];

  const out = [];
  for (const d of deals) {
    const idn = await upsertIdentity(client, tenantId, { phone: d.phone, name: d.name, company: d.company });
    const cid = await upsertCase(client, tenantId, {
      identityId: idn,
      pack: 'finance',
      stage: 'WON',
      sea: 'private',
      product: 'kb-crm',
      ownerSeatId: seats.agent.seat_id,
      lastTouchAt: daysAgo(2),
      protectedUntil: hoursFromNow(72),
      companyTag: `成交回款·${d.company}`,
      nextFollowAt: hoursFromNow(6),
      followStatus: 'open',
    });
    await ensureOwnership(client, tenantId, cid, seats.agent.seat_id);
    await client.query(
      `UPDATE pool_items SET status = 'claimed' WHERE tenant_id = $1 AND case_id = $2 AND status = 'open'`,
      [tenantId, cid],
    );

    // contract
    let cr = await client.query(
      `SELECT id FROM contracts WHERE tenant_id = $1 AND case_id = $2 LIMIT 1`,
      [tenantId, cid],
    );
    let contractId;
    if (cr.rows[0]) {
      contractId = cr.rows[0].id;
      await client.query(
        `UPDATE contracts SET amount = $2, status = 'signed', signed_at = COALESCE(signed_at, now()), note = $3, updated_at = now() WHERE id = $1`,
        [contractId, d.amount, `demo_pack=finance`],
      );
    } else {
      contractId = randomUUID();
      await client.query(
        `INSERT INTO contracts (id, tenant_id, case_id, amount, currency, status, signed_at, attachment_url, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'CNY', 'signed', now(), NULL, 'demo_pack=finance', now(), now())`,
        [contractId, tenantId, cid, d.amount],
      );
    }

    // wipe prior demo plans/receipts for this contract then reinsert (idempotent story)
    await client.query(`DELETE FROM payment_receipts WHERE contract_id = $1`, [contractId]);
    await client.query(`DELETE FROM payment_plans WHERE contract_id = $1`, [contractId]);

    for (const pl of d.plans) {
      const planId = randomUUID();
      const planStatus = pl.status === 'paid' ? 'paid' : 'pending';
      await client.query(
        `INSERT INTO payment_plans (id, tenant_id, contract_id, case_id, due_at, amount, status, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
        [planId, tenantId, contractId, cid, pl.due, pl.amount, planStatus, `demo finance ${pl.status}`],
      );
      if (pl.receipt) {
        await client.query(
          `INSERT INTO payment_receipts (id, tenant_id, contract_id, case_id, plan_id, paid_at, amount, method, note, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'transfer', 'demo partial receipt', now())`,
          [randomUUID(), tenantId, contractId, cid, planId, daysAgo(1), pl.amount],
        );
      }
    }
    await ensureActivity(client, tenantId, cid, 'note', `【成交回款】合同 ${d.amount} CNY 已签`, {
      demo_pack: 'finance', contract_id: contractId,
    });
    out.push({ case_id: cid, contract_id: contractId, amount: d.amount });
  }
  return { pack: 'finance', deals: out.length };
}

async function main() {
  const pack = argPack();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const tenantId = await ensureTenant(client);
    await ensurePoolRules(client, tenantId);
    const seats = {
      agent: await userSeat(client, tenantId, 'agent@demo.local'),
      agent2: await userSeat(client, tenantId, 'agent2@demo.local'),
      manager: await userSeat(client, tenantId, 'manager@demo.local'),
    };
    if (!seats.agent.seat_id || !seats.agent2.seat_id) {
      throw new Error('agent seats missing — run npm run seed first');
    }

    const summary = {};
    if (pack === 'all' || pack === 'tele') summary.tele = await seedTele(client, tenantId, seats);
    if (pack === 'all' || pack === 'b2b') summary.b2b = await seedB2b(client, tenantId, seats);
    if (pack === 'all' || pack === 'finance') summary.finance = await seedFinance(client, tenantId, seats);

    // counts for visibility
    const counts = await client.query(
      `SELECT flags->>'demo_pack' AS pack, count(*)::int AS n
       FROM lead_cases WHERE tenant_id = $1 AND flags->>'demo_pack' IS NOT NULL
       GROUP BY 1 ORDER BY 1`,
      [tenantId],
    );
    console.log(JSON.stringify({
      ok: true,
      pack_requested: pack,
      summary,
      demo_case_counts: counts.rows,
      hint: 'Distinguish in UI via company_name prefixes 【电销】/B2B/【成交】 and flags.demo_pack',
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('seed-demo-packs FAILED:', e.message || e);
  process.exit(1);
});
