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

  let tenant = await tenants.findOne({ where: { name: '演示销售公司' } });
  if (!tenant) {
    tenant = await tenants.save(tenants.create({
      name: '演示销售公司',
      mode_flags: ['LEAD_INBOUND', 'HYBRID'],
    }));
  }
  let group = await groups.findOne({ where: { tenant_id: tenant.id, name: '默认技能组' } });
  if (!group) {
    group = await groups.save(groups.create({
      tenant_id: tenant.id, name: '默认技能组', skills: ['general'], max_in_progress: 50,
    }));
  }
  for (const [email, name, role] of [
    ['agent@demo.local', '演示坐席', 'agent'],
    ['admin@demo.local', '演示主管', 'supervisor'],
  ] as const) {
    let u = await users.findOne({ where: { tenant_id: tenant.id, email } });
    if (!u) {
      u = await users.save(users.create({
        tenant_id: tenant.id, email, display_name: name, role,
        password_hash: await bcrypt.hash('demo1234', 10),
      }));
    }
    const seat = await seats.findOne({ where: { user_id: u.id } });
    if (!seat) {
      await seats.save(seats.create({
        tenant_id: tenant.id, user_id: u.id, skill_group_id: group.id, online: true,
      }));
    }
  }
  console.log('Seed OK. Login: agent@demo.local / demo1234');
  await ds.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
