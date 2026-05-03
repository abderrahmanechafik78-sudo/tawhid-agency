const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'tawhid-secret-2025';
const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const init = {
      leads: [],
      messages: [],
      admin: { username: 'admin', password: bcrypt.hashSync(process.env.ADMIN_PASS || 'tawhid2025', 10) }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}
readDB();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}


async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Tawhid Agency <onboarding@resend.dev>',
      to,
      subject,
      html
    });
    console.log('📧 Email sent to', to);
  } catch(e) { console.log('Email error:', e.message); }
}

async function getAIReply(messages) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-key-here') {
    return getFallback(messages[messages.length-1]?.content || '');
  }
  try {
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      max_tokens: 200,
      messages: [
        { role: 'system', content: `Tu es l'assistant AI de Tawhid Agency, agence premium d'automatisation AI au Maroc.

SERVICES: AI Chatbots WhatsApp & Web (3-5 jours), Workflow Automation (40h+/mois économisés), Solutions AI Custom, SaaS MVP (3 semaines).

PRIX: Starter 3,500 MAD/mois | Pro 8,000 MAD/mois | Enterprise sur mesure.

OBJECTIF: Qualifier les prospects et les orienter vers l'audit gratuit 30min.
Contact: hello@tawhidagency.ma

Réponds dans la langue du visiteur (FR/AR/EN). Sois concis et orienté résultats.` },
        ...messages
      ]
    });
    return res.choices[0].message.content;
  } catch(e) {
    console.log('OpenAI error:', e.message);
    return getFallback(messages[messages.length-1]?.content || '');
  }
}

function getFallback(msg) {
  const m = msg.toLowerCase();
  if (m.includes('prix') || m.includes('price') || m.includes('tarif') || m.includes('combien') || m.includes('cost'))
    return 'Nos forfaits commencent à **3,500 MAD/mois** (Starter). Pro à 8,000 MAD/mois, Enterprise sur mesure. Voulez-vous un audit gratuit pour voir exactement ce qui vous convient? 💼';
  if (m.includes('whatsapp') || m.includes('chatbot') || m.includes('bot'))
    return 'Nous créons des bots WhatsApp propulsés par GPT-4 qui gèrent support, ventes & réservations 24/7. Déploiement en 3-5 jours. Voulez-vous voir une démo? 🤖';
  if (m.includes('audit') || m.includes('call') || m.includes('rdv') || m.includes('consultation'))
    return 'Super! Remplissez le formulaire de contact et nous vous recontactons sous 24h pour votre audit gratuit de 30min. 📅';
  if (m.includes('automation') || m.includes('workflow') || m.includes('automatisation'))
    return 'Nous connectons vos apps et automatisons les tâches répétitives — Zapier, Make, n8n, APIs custom. La plupart de nos clients économisent 40h+/mois. 🚀';
  if (m.includes('délai') || m.includes('temps') || m.includes('long') || m.includes('time'))
    return 'Chatbot basique: 3-5 jours. Automation workflow: 1-2 semaines. AI custom ou SaaS MVP: 2-4 semaines. Livraison garantie! ⏱';
  return 'Excellente question! Notre équipe vous répond sous 24h. Remplissez le formulaire de contact pour votre consultation gratuite — sans engagement. 👇';
}

app.get('/api/health', (req, res) => res.json({
  status: 'OK',
  openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-key-here',
  email: !!process.env.RESEND_API_KEY
}));

app.post('/api/leads', async (req, res) => {
  const { name, email, company, service, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  const db = readDB();
  const lead = {
    id: Date.now().toString(), name, email,
    company: company || '', service: service || '',
    message: message || '', status: 'new',
    createdAt: new Date().toISOString(), notes: ''
  };
  db.leads.push(lead);
  writeDB(db);

  sendEmail(
    process.env.NOTIFY_EMAIL || process.env.EMAIL_USER,
    '🔥 New Lead: ' + name + ' — ' + (service || 'Website'),
    '<h2 style="color:#0f6e56">New Lead — Tawhid Agency</h2>' +
    '<p><b>Name:</b> ' + name + '</p>' +
    '<p><b>Email:</b> ' + email + '</p>' +
    '<p><b>Company:</b> ' + (company||'—') + '</p>' +
    '<p><b>Service:</b> ' + (service||'—') + '</p>' +
    '<p><b>Message:</b> ' + (message||'—') + '</p>' +
    '<p><b>Time:</b> ' + new Date().toLocaleString() + '</p>' +
    '<br/><a href="http://localhost:3001/admin" style="background:#0a0f1e;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">View Dashboard →</a>'
  );

  sendEmail(
    email,
    '✅ We received your message — Tawhid Agency',
    '<h2>Hi ' + name + '! 👋</h2>' +
    '<p>Thanks for reaching out to <b>Tawhid Agency</b>.</p>' +
    '<p>We received your inquiry about <b>' + (service||'our services') + '</b> and will contact you within <b>24 hours</b>.</p>' +
    '<p>— Chafik, Tawhid Agency 🇲🇦</p>'
  );

  res.json({ success: true, message: 'Lead received!' });
});

app.post('/api/chat', async (req, res) => {
  const { messages, sessionId } = req.body;
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: 'Messages array required' });

  const reply = await getAIReply(messages);
  const userMsg = messages[messages.length - 1]?.content || '';

  const db = readDB();
  if (!db.messages) db.messages = [];

  const existing = db.messages.find(m => m.sessionId === sessionId);
  if (existing) {
    existing.messages = [...messages, { role: 'assistant', content: reply }];
    existing.updatedAt = new Date().toISOString();
  } else {
    db.messages.push({
      id: Date.now().toString(),
      sessionId: sessionId || 'anonymous',
      messages: [...messages, { role: 'assistant', content: reply }],
      createdAt: new Date().toISOString()
    });

    // Send email on first message only
    sendEmail(
      process.env.NOTIFY_EMAIL || process.env.EMAIL_USER,
      '💬 New Chat — Tawhid Agency',
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#00e5a0">New Chat on Your Website 💬</h2>
        <p style="color:#666">${new Date().toLocaleString()}</p>
        <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin:12px 0">
          <p style="margin:0;font-size:12px;color:#999">SESSION</p>
          <p style="margin:4px 0 0;font-family:monospace;font-weight:600">${sessionId || 'anonymous'}</p>
        </div>
        <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin:12px 0">
          <p style="margin:0;font-size:12px;color:#999">VISITOR SAID</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:500">${userMsg}</p>
        </div>
        <div style="background:#f0fff8;border:1px solid #00e5a0;border-radius:8px;padding:16px;margin:12px 0">
          <p style="margin:0;font-size:12px;color:#999">AI REPLIED</p>
          <p style="margin:4px 0 0">${reply}</p>
        </div>
        <a href="http://localhost:3001/admin" style="display:inline-block;margin-top:16px;background:#0a0f1e;color:#00e5a0;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">View Dashboard →</a>
      </div>`
    );
  }

  if (db.messages.length > 500) db.messages = db.messages.slice(-500);
  writeDB(db);
  res.json({ reply });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  if (username !== db.admin.username || !bcrypt.compareSync(password, db.admin.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

app.get('/api/leads', auth, (req, res) => {
  const { status, search } = req.query;
  const db = readDB();
  let leads = [...db.leads];
  if (status && status !== 'all') leads = leads.filter(l => l.status === status);
  if (search) leads = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.email.toLowerCase().includes(search.toLowerCase()) ||
    (l.company || '').toLowerCase().includes(search.toLowerCase())
  );
  leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const all = db.leads;
  res.json({
    leads,
    stats: {
      total: all.length,
      new: all.filter(l => l.status === 'new').length,
      contacted: all.filter(l => l.status === 'contacted').length,
      converted: all.filter(l => l.status === 'converted').length,
    }
  });
});

app.patch('/api/leads/:id', auth, (req, res) => {
  const db = readDB();
  const lead = db.leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (req.body.status) lead.status = req.body.status;
  if (req.body.notes !== undefined) lead.notes = req.body.notes;
  writeDB(db);
  res.json({ success: true });
});

app.delete('/api/leads/:id', auth, (req, res) => {
  const db = readDB();
  db.leads = db.leads.filter(l => l.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
);


// ── STRIPE PAYMENT ──
const stripe = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== "sk_test_placeholder" ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

const PLANS = {
  starter: { name: 'Starter', price: 150000, currency: 'mad', description: 'AI Chatbot + 3 Automations' },
  pro:     { name: 'Pro',     price: 350000, currency: 'mad', description: 'Full AI Suite - Unlimited' },
  custom:  { name: 'Custom',  price: 100000, currency: 'usd', description: 'Custom AI Solution' }
};

// Create checkout session
app.post('/api/payment/checkout', async (req, res) => {
  const { plan, customerEmail, customerName } = req.body;
  const planData = PLANS[plan];
  if (!planData) return res.status(400).json({ error: 'Invalid plan' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [{
        price_data: {
          currency: planData.currency,
          product_data: {
            name: `Tawhid Agency — ${planData.name}`,
            description: planData.description,
            images: [],
          },
          unit_amount: planData.price,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/pricing`,
      metadata: { plan, customerName: customerName || '' }
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch(e) {
    console.log('Stripe error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Create one-time payment link
app.post('/api/payment/link', async (req, res) => {
  const { amount, description, customerEmail } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: description || 'Tawhid Agency Service' },
          unit_amount: amount * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.BASE_URL}/payment-success`,
      cancel_url: `${process.env.BASE_URL}/`,
    });
    res.json({ url: session.url });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Webhook — payment confirmed
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch { return res.status(400).send('Webhook error'); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const db = readDB();
    if (!db.payments) db.payments = [];
    db.payments.push({
      id: session.id,
      customerEmail: session.customer_email,
      amount: session.amount_total,
      currency: session.currency,
      plan: session.metadata?.plan || 'custom',
      status: 'paid',
      paidAt: new Date().toISOString()
    });
    writeDB(db);
    sendEmail(
      session.customer_email,
      '✅ Payment confirmed — Tawhid Agency',
      `<h2>Payment received! 🎉</h2><p>Thank you for choosing Tawhid Agency.</p><p>Amount: <b>${session.amount_total/100} ${session.currency.toUpperCase()}</b></p><p>We will contact you within 24 hours to start your project.</p><p>— Chafik, Tawhid Agency 🇲🇦</p>`
    );
  }
  res.json({ received: true });
});

// Get all payments (admin)
app.get('/api/payments', auth, (req, res) => {
  const db = readDB();
  res.json({ payments: db.payments || [] });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Tawhid Backend running!`);
  console.log(`   Email:     ${process.env.RESEND_API_KEY ? '✅ Resend connected' : '❌ Not configured'}`);
  console.log(`   API:       http://localhost:${PORT}/api`);
  console.log(`   Dashboard: http://localhost:${PORT}/admin`);
  console.log(`   OpenAI:    ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-key-here' ? '✅ Connected' : '⚡ Fallback mode'}`);
  console.log(`\n🔑 Login: admin / tawhid2025\n`);
});
// Stripe null guard already handled above
