const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow requests from your Wix site
app.use(express.json()); // Parse JSON bodies

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Stripe server is running!',
    timestamp: new Date().toISOString()
  });
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { amount, currency, customerEmail, description, successUrl, cancelUrl, metadata } = req.body;

    console.log('Creating checkout session for:', { amount, currency, customerEmail, description });

    // Validate required fields
    if (!amount || !customerEmail) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount and customerEmail are required' 
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency || 'usd',
            product_data: {
              name: description || 'Team Roping Courses',
              description: metadata ? `Courses: ${metadata.courses}` : 'Digital course purchase'
            },
            unit_amount: amount, // Amount in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${req.headers.origin || 'https://your-site.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || req.headers.origin || 'https://your-site.com',
      customer_email: customerEmail,
      metadata: metadata || {},
    });

    console.log('Checkout session created:', session.id);

    res.json({ 
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(400).json({ 
      error: error.message,
      type: error.type || 'unknown_error'
    });
  }
});

// Retrieve session status (for success page)
app.get('/session-status', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.json({
      status: session.status,
      customer_email: session.customer_details?.email,
      payment_status: session.payment_status,
      amount_total: session.amount_total
    });

  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(400).json({ error: error.message });
  }
});

// Webhook endpoint for Stripe events (optional)
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Only verify webhook if secret is set
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.log(`Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('✅ Payment succeeded for session:', session.id);
      // TODO: Fulfill the order, send confirmation email, etc.
      break;
    
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('✅ PaymentIntent succeeded:', paymentIntent.id);
      break;
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({received: true});
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}`);
  console.log(`🔑 Stripe key configured: ${process.env.STRIPE_SECRET_KEY ? '✅ Yes' : '❌ No'}`);
});

module.exports = app;
