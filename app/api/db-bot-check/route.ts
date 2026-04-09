export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function GET() {
  try {
    const { rows } = await sql.query(`
      SELECT p.id, p.programme_name, p.whatsapp_group_id,
        c.first_name as coach_first_name, c.whatsapp_bot_status, c.mobile as coach_mobile,
        pr.trading_name,
        (SELECT COUNT(*) FROM faqs f WHERE f.programme_id = p.id AND f.status = 'active') as faq_count
      FROM programmes p
      JOIN coaches_v2 c ON c.id = p.coach_id
      JOIN providers pr ON pr.id = c.provider_id
      WHERE p.whatsapp_group_id = $1 AND p.is_active = true
      LIMIT 1
    `, ['120363410006764054@g.us'])

    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
    const anthropicKeyPrefix = (process.env.ANTHROPIC_API_KEY || '').substring(0, 10)
    const hasEvolutionKey = !!process.env.EVOLUTION_API_KEY
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'NOT SET'
    const evolutionInstance = process.env.EVOLUTION_INSTANCE || 'NOT SET'

    return NextResponse.json({
      programme: rows[0] || null,
      found: rows.length > 0,
      envCheck: { hasAnthropicKey, anthropicKeyPrefix, hasEvolutionKey, evolutionUrl, evolutionInstance },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
