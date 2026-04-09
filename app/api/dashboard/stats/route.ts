export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStats, getPaymentStats, getConversationStats, getTopCategories } from '@/app/lib/db'

export async function GET(request: NextRequest) {
  try {
    const coachId = request.nextUrl.searchParams.get('coachId')
    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID required' }, { status: 400 })
    }

    const [stats, payments, conversations, categories] = await Promise.all([
      getDashboardStats(coachId),
      getPaymentStats(coachId),
      getConversationStats(coachId),
      getTopCategories(coachId),
    ])

    return NextResponse.json({
      activeMembers: Number(stats.active_members),
      activeProgrammes: Number(stats.active_programmes),
      revenueThisMonth: Number(stats.revenue_this_month),
      outstanding: Number(stats.outstanding),
      botInteractionsWeek: Number(stats.bot_interactions_week),
      escalatedWeek: Number(stats.escalated_week),
      pendingFaqs: Number(stats.pending_faqs),
      payments: {
        revenueThisMonth: Number(payments.revenue_this_month),
        outstanding: Number(payments.outstanding),
        overdueCount: Number(payments.overdue_count),
      },
      conversations: {
        total: Number(conversations.total),
        botHandled: Number(conversations.bot_handled),
        escalated: Number(conversations.escalated),
      },
      topCategories: categories.map((c: Record<string, unknown>) => ({
        category: c.category,
        count: Number(c.count),
      })),
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
