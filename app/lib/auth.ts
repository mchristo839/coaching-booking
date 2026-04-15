// app/lib/auth.ts
// SERVER-SIDE ONLY: JWT auth helpers using jose (edge-compatible)

import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'auth_token'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signJwt(providerId: string, coachId?: string): Promise<string> {
  return new SignJWT({ sub: providerId, coachId: coachId || null })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifyJwt(token: string): Promise<{ sub: string; coachId: string | null } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return { sub: payload.sub as string, coachId: (payload.coachId as string) || null }
  } catch {
    return null
  }
}

export async function getAuthFromRequest(request: NextRequest): Promise<{ providerId: string; coachId: string | null } | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifyJwt(token)
  if (!payload) return null
  return { providerId: payload.sub, coachId: payload.coachId }
}

export function setAuthCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
  return response
}

export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
