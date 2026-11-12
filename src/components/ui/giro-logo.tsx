'use client'

import React, { useState } from 'react'
import Image from 'next/image'

interface GiroLogoIconProps {
  size?: number
  className?: string
  alt?: string
}

/**
 * Ícone Oficial do Giro Sistema (Squircle Laranja com Loja & Seta Circular)
 */
export function GiroLogoIcon({ size = 40, className = '', alt = 'Giro Sistema' }: GiroLogoIconProps) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 shadow-lg shadow-amber-500/20 text-slate-950 font-black ${className}`}
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-3/5 h-3/5 text-slate-950"
        >
          {/* Seta circular */}
          <path
            d="M24 6C14.0589 6 6 14.0589 6 24C6 33.9411 14.0589 42 24 42C33.9411 42 42 33.9411 42 24C42 19.5 40.3 15.4 37.5 12.3"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M37 6V13H30"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Loja / Toldinho */}
          <path
            d="M17 21H31L32 26H16L17 21Z"
            fill="currentColor"
          />
          <path
            d="M18 26V33H30V26"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 shadow-md shadow-amber-500/10 ${className}`}
    >
      <img
        src="/logo-giro.png"
        alt={alt}
        onError={() => setError(true)}
        className="h-full w-full object-cover"
      />
    </div>
  )
}

interface GiroFullLogoProps {
  iconSize?: number
  className?: string
  subtitle?: string
}

/**
 * Logo Completa do Giro Sistema (Ícone + Tipografia)
 */
export function GiroFullLogo({
  iconSize = 42,
  className = '',
  subtitle = 'GESTÃO COMERCIAL',
}: GiroFullLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <GiroLogoIcon size={iconSize} />
      <div className="overflow-hidden">
        <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5 leading-none">
          GIRO <span className="text-amber-400">SISTEMA</span>
        </h1>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          {subtitle}
        </p>
      </div>
    </div>
  )
}

interface NetworkLogoProps {
  network?: {
    name: string
    logo_url?: string | null
  } | null
  size?: number
  className?: string
  fallbackToGiro?: boolean
}

/**
 * Exibe a Logo da Rede Ativa (ou Giro Sistema como fallback global)
 */
export function NetworkLogo({
  network,
  size = 40,
  className = '',
  fallbackToGiro = true,
}: NetworkLogoProps) {
  const [imgError, setImgError] = useState(false)

  // Resolução inteligente da logo da rede
  let resolvedUrl = network?.logo_url || null
  if (!resolvedUrl && network?.name) {
    const lower = network.name.toLowerCase()
    if (lower.includes('ovo')) resolvedUrl = '/logo-grupo-ovo.png'
    else if (lower.includes('bebidas')) resolvedUrl = '/logo-m-bebidas.png'
  }

  if (resolvedUrl && !imgError) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`relative shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-sm ${className}`}
      >
        <img
          src={resolvedUrl}
          alt={network?.name || 'Logo da Rede'}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  if (!network && fallbackToGiro) {
    return <GiroLogoIcon size={size} className={className} />
  }

  const initials = (network?.name || 'R')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 font-black text-slate-950 shadow-sm text-sm border border-amber-400/30 ${className}`}
    >
      {initials}
    </div>
  )
}

/**
 * Redimensiona qualquer imagem no navegador para <= maxDim x maxDim em Base64 PNG.
 * Evita sobrecarga de tráfego, dispensa buckets adicionais e funciona instantaneamente.
 */
export function resizeImageFileToBase64(file: File, maxDim = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem'))
    reader.onload = (event) => {
      const img = new window.Image()
      img.onerror = () => reject(new Error('Falha ao carregar a imagem selecionada'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Contexto 2D do Canvas indisponível'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png', 0.9))
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

