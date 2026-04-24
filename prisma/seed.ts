import { PrismaClient, Plan, UserRole, ChannelType, AiProvider } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      plan: Plan.PRO,
      isActive: true,
      settings: { timezone: 'America/Mexico_City', language: 'es' },
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Create admin user (password: Admin123!)
  const passwordHash = await bcrypt.hash('Admin123!', 10);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.com',
      passwordHash,
      name: 'Admin User',
      role: UserRole.OWNER,
    },
  });
  console.log(`Admin: ${admin.email} (${admin.id})`);

  // 3. Create agent user (password: Agent123!)
  const agentHash = await bcrypt.hash('Agent123!', 10);
  const agent = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'agent@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'agent@demo.com',
      passwordHash: agentHash,
      name: 'Agent User',
      role: UserRole.AGENT,
    },
  });
  console.log(`Agent: ${agent.email} (${agent.id})`);

  // 4. Create a WhatsApp channel (dummy credentials)
  const channel = await prisma.channel.upsert({
    where: { tenantId_type_provider_name: { tenantId: tenant.id, type: ChannelType.WHATSAPP, provider: 'META', name: 'WhatsApp Principal' } },
    update: {},
    create: {
      tenantId: tenant.id,
      type: ChannelType.WHATSAPP,
      name: 'WhatsApp Principal',
      credentials: { phoneNumberId: 'DEMO_PHONE_ID', accessToken: 'DEMO_ACCESS_TOKEN' },
      webhookSecret: 'demo-webhook-secret',
      isActive: true,
    },
  });
  console.log(`Channel: ${channel.name} (${channel.id})`);

  // 5. Create AI context
  const aiContext = await prisma.aiContext.upsert({
    where: { id: 'demo-ai-context' },
    update: {},
    create: {
      id: 'demo-ai-context',
      tenantId: tenant.id,
      name: 'Asistente Principal',
      systemPrompt: 'Eres un asistente virtual de Demo Company. Responde de forma amable, profesional y concisa. Ayudas a los clientes con sus consultas sobre productos y servicios.',
      personality: 'Amable, profesional, eficiente',
      language: 'es',
      provider: AiProvider.OPENAI,
      model: 'gpt-4o-mini',
      maxTokens: 1000,
      memoryWindowSize: 20,
      isActive: true,
      fallbackMessage: 'Disculpa, no puedo procesar tu mensaje en este momento. Un agente humano te atenderá pronto.',
    },
  });
  console.log(`AI Context: ${aiContext.name} (${aiContext.id})`);

  // 6. Create sample contacts
  const contact1 = await prisma.contact.upsert({
    where: { tenantId_externalId_channelType: { tenantId: tenant.id, externalId: '5215512345678', channelType: ChannelType.WHATSAPP } },
    update: {},
    create: {
      tenantId: tenant.id,
      externalId: '5215512345678',
      channelType: ChannelType.WHATSAPP,
      name: 'Juan Pérez',
      phone: '+5215512345678',
      tags: ['vip', 'frecuente'],
    },
  });

  const contact2 = await prisma.contact.upsert({
    where: { tenantId_externalId_channelType: { tenantId: tenant.id, externalId: '5215587654321', channelType: ChannelType.WHATSAPP } },
    update: {},
    create: {
      tenantId: tenant.id,
      externalId: '5215587654321',
      channelType: ChannelType.WHATSAPP,
      name: 'María García',
      phone: '+5215587654321',
      tags: ['nuevo'],
    },
  });
  console.log(`Contacts: ${contact1.name}, ${contact2.name}`);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
