const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow cross-origin requests from your Wix frontend
app.use(express.json()); // Parse JSON bodies

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Stripe server is running!' });
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl, customerEmail } = req.body;

    // Create Checkout Sessions from body parameters
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      line_items: [
        {
          price: priceId, // This should be a Stripe Price ID like 'price_1234567890'
          quantity: 1,
        },
      ],
      mode: 'payment', // Can be 'payment', 'subscription', or 'setup'
      return_url: successUrl || `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      automatic_tax: { enabled: true },
      customer_email: customerEmail, // Optional: pre-fill customer email
    });

    res.json({ 
      clientSecret: session.client_secret,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(400).json({ 
      error: error.message 
    });
  }
});

// Retrieve Checkout Session (for success page)
app.get('/session-status', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    res.json({
      status: session.status,
      customer_email: session.customer_details.email,
      payment_status: session.payment_status
    });
  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(400).json({ error: error.message });
  }
});

// Webhook endpoint for Stripe events (optional but recommended)
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Payment succeeded:', session);
      // TODO: Fulfill the order, send confirmation email, etc.
      break;
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent succeeded:', paymentIntent);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to test`);
});

module.exports = app;
