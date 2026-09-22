import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ALL_ENTITIES, Tenant, User, SkillGroup, AgentSeat } from '../entities';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgres://sales:sales@127.0.0.1:5432/sales_os',
    entities: ALL_ENTITIES,
    synchronize: true,
  });
  await ds.initialize();
  const tenants = ds.getRepository(Tenant);
  const users = ds.getRepository(User);
  const groups = ds.getRepository(SkillGroup);
  const seats = ds.getRepository(AgentSeat);

  let tenant = await tenants.findOne({ where: { slug: 'demo' } });
  if (!tenant) tenant = await tenants.findOne({ where: { name: '演示销售公司' } });
  if (!tenant) {
    tenant = await tenants.save(tenants.create({
      name: '演示销售公司',
      slug: 'demo',
      mode_flags: ['LEAD_INBOUND', 'HYBRID'],
    }));
  }
  let group = await groups.findOne({ where: { tenant_id: tenant.id, name: '默认技能组' } });
  if (!group) {
    group = await groups.save(groups.create({
      tenant_id: tenant.id,
      name: '默认技能组',
      skills: ['general', 'demo', 'ticket-grab', 'usgate'],
      max_in_progress: 50,
    }));
  }

    const pick = (k: string, fallback: string) => {
    const v = process.env[k];
    return v && v !== 'CHANGE_ME' ? v : fallback;
  };
  const agentPass = pick('DEMO_AGENT_PASSWORD', process.env.DEMO_DEFAULT_PASSWORD || 'demo1234');
  const agent2Pass = pick('DEMO_AGENT2_PASSWORD', agentPass);
  const adminPass = pick('DEMO_ADMIN_PASSWORD', process.env.DEMO_DEFAULT_PASSWORD || 'demo1234');
  const managerPass = pick('DEMO_MANAGER_PASSWORD', adminPass);
  const viewerPass = pick('DEMO_VIEWER_PASSWORD', 'demo-viewer');

  for (const [email, name, role, pass] of [
    ['agent@demo.local', '演示销售1', 'agent', agentPass],
    ['agent2@demo.local', '演示销售2', 'agent', agent2Pass],
    ['manager@demo.local', '演示经理', 'supervisor', managerPass],
    ['admin@demo.local', '演示管理员', 'admin', adminPass],
    ['viewer@demo.local', '演示访客(只读)', 'viewer', viewerPass],
  ] as const) {
    let u = await users.findOne({ where: { tenant_id: tenant.id, email } });
    const password_hash = await bcrypt.hash(pass, 10);
    if (!u) {
      u = await users.save(users.create({
        tenant_id: tenant.id, email, display_name: name, role, password_hash,
      }));
    } else {
      u.role = role;
      u.display_name = name;
      u.password_hash = password_hash;
      await users.save(u);
    }
    if (role === 'viewer') continue;
    const seat = await seats.findOne({ where: { user_id: u.id } });
    if (!seat) {
      await seats.save(seats.create({
        tenant_id: tenant.id,
        user_id: u.id,
        skill_group_id: group.id,
        online: true,
        current_load: 0,
        shift: 'day',
      }));
    }
  }
  console.log('Seed OK. Logins: agent@ / agent2@ / manager@ / admin@ / viewer@demo.local (passwords from .env)');
  await ds.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
