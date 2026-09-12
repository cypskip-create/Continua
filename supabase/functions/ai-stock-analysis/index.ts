import "../deno.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, analysisType, holdings } = await req.json();
    console.log('AI Analysis request:', { symbol, analysisType });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (analysisType === 'recommendation') {
      systemPrompt = `You are an expert stock analyst for the Nairobi Securities Exchange (NSE). 
      Provide detailed stock recommendations based on Kenyan market conditions, considering factors like:
      - Company fundamentals and financial health
      - Market trends in Kenya
      - Industry position
      - Economic indicators
      
      Format your response as JSON with: recommendation (buy/sell/hold), confidence (0-100), reasoning (detailed explanation)`;
      
      userPrompt = `Analyze ${symbol} and provide a trading recommendation.`;
    } else if (analysisType === 'sentiment') {
      systemPrompt = `You are a sentiment analysis expert for financial markets. 
      Analyze market sentiment for Kenyan stocks considering news, social media, and market data.
      
      Format your response as JSON with: sentiment (positive/neutral/negative), score (0-100), summary (brief explanation)`;
      
      userPrompt = `Analyze current market sentiment for ${symbol}.`;
    } else if (analysisType === 'portfolio') {
      systemPrompt = `You are a portfolio analyst specializing in risk assessment and diversification.
      Analyze portfolio composition and provide insights on risk, sector allocation, and rebalancing opportunities.
      
      Format your response as JSON with: riskLevel (low/medium/high), diversificationScore (0-100), suggestions (array of actionable recommendations)`;
      
      userPrompt = `Analyze this portfolio: ${JSON.stringify(holdings)}. Provide risk assessment and rebalancing suggestions.`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI Gateway error:', error);
      throw new Error('AI analysis failed');
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    console.log('AI Response:', aiResponse);

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(aiResponse);
    } catch {
      // If not JSON, wrap in object
      result = { analysis: aiResponse };
    }

    // Save recommendation if applicable
    if (analysisType === 'recommendation' && result.recommendation) {
      await supabase.from('ai_recommendations').insert({
        user_id: user.id,
        symbol,
        recommendation_type: result.recommendation.toLowerCase(),
        confidence_score: result.confidence || 50,
        reasoning: result.reasoning || aiResponse,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});