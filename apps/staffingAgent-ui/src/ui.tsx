// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Small visual primitives shared by the views: tones (theme tokens only),
 * tinted backgrounds, pulsing live indicators, icon tiles and pills.
 * Animations use the Web Animations API, so no stylesheet is needed.
 */

import React, { useEffect, useRef } from 'react';

// =============================================================================
// TONES
// =============================================================================

export type Tone = 'brand' | 'success' | 'info' | 'warning' | 'error' | 'muted' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'red';

/** Every tone resolves to a theme token, so light, dark and VS Code palettes all work. */
export const TONE: Record<Tone, string> = {
	brand: 'var(--rr-brand)',
	success: 'var(--rr-color-success)',
	info: 'var(--rr-color-info)',
	warning: 'var(--rr-color-warning)',
	error: 'var(--rr-color-error)',
	muted: 'var(--rr-text-secondary)',
	blue: 'var(--rr-chart-blue)',
	green: 'var(--rr-chart-green)',
	yellow: 'var(--rr-chart-yellow)',
	purple: 'var(--rr-chart-purple)',
	orange: 'var(--rr-chart-orange)',
	red: 'var(--rr-chart-red)',
};

/** A token colour at `percent` opacity (color-mix keeps it theme-driven). */
export function tint(color: string, percent: number): string {
	return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
	iconTile: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
	pill: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 4,
		padding: '1px 7px',
		borderRadius: 999,
		fontSize: 10.5,
		fontWeight: 700,
		letterSpacing: '0.3px',
		whiteSpace: 'nowrap',
		lineHeight: '16px',
	},
	dotWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
	dotRing: { position: 'absolute', inset: 0, borderRadius: '50%' },
	dotCore: { position: 'relative', borderRadius: '50%' },
};

function iconTileStyle(tone: Tone, size: number): React.CSSProperties {
	return {
		...styles.iconTile,
		width: size,
		height: size,
		borderRadius: Math.round(size * 0.3),
		color: TONE[tone],
		background: tint(TONE[tone], 14),
		boxShadow: `inset 0 0 0 1px ${tint(TONE[tone], 28)}`,
	};
}

function pillStyle(tone: Tone): React.CSSProperties {
	return { ...styles.pill, color: TONE[tone], background: tint(TONE[tone], 13), boxShadow: `inset 0 0 0 1px ${tint(TONE[tone], 24)}` };
}

function dotStyle(tone: Tone, size: number): { wrap: React.CSSProperties; ring: React.CSSProperties; core: React.CSSProperties } {
	return {
		wrap: { ...styles.dotWrap, width: size, height: size },
		ring: { ...styles.dotRing, background: TONE[tone] },
		core: { ...styles.dotCore, width: size, height: size, background: TONE[tone] },
	};
}

// =============================================================================
// ANIMATION
// =============================================================================

function reducedMotion(): boolean {
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs a looping keyframe animation on the referenced element while `active`. */
function useLoop<T extends HTMLElement>(active: boolean, keyframes: Keyframe[], duration: number) {
	const ref = useRef<T>(null);
	useEffect(() => {
		const element = ref.current;
		if (!active || !element || typeof element.animate !== 'function' || reducedMotion()) return;
		const animation = element.animate(keyframes, { duration, iterations: Infinity, easing: 'ease-in-out' });
		return () => animation.cancel();
		// The keyframes are module constants: the effect only restarts on `active`.
	}, [active, duration]);
	return ref;
}

const FADE: Keyframe[] = [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }];
const RIPPLE: Keyframe[] = [
	{ transform: 'scale(1)', opacity: 0.55 },
	{ transform: 'scale(2.6)', opacity: 0 },
];

// =============================================================================
// COMPONENTS
// =============================================================================

/** Fades its children in and out while `active` (running work). */
export const Pulse: React.FC<{ active: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ active, children, style }) => {
	const ref = useLoop<HTMLSpanElement>(active, FADE, 1600);
	return (
		<span ref={ref} style={style}>
			{children}
		</span>
	);
};

/** A status dot; `live` adds a ripple ring around it. */
export const LiveDot: React.FC<{ tone: Tone; live?: boolean; size?: number }> = ({ tone, live = false, size = 8 }) => {
	const ring = useLoop<HTMLSpanElement>(live, RIPPLE, 1800);
	const s = dotStyle(tone, size);
	return (
		<span style={s.wrap} aria-hidden>
			{live && <span ref={ring} style={s.ring} />}
			<span style={s.core} />
		</span>
	);
};

/** A rounded square holding an icon, tinted with the tone. */
export const IconTile: React.FC<{ tone: Tone; size?: number; children: React.ReactNode }> = ({ tone, size = 32, children }) => (
	<span style={iconTileStyle(tone, size)} aria-hidden>
		{children}
	</span>
);

/** A small tinted label. */
export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
	<span style={pillStyle(tone)} title={title}>
		{children}
	</span>
);
