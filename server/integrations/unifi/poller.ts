/**
 * UniFi Poller
 *
 * Fetches WAN health, gateway uptime, and top 5 clients every 30 seconds.
 *
 * Endpoints used (UniFi OS console prefix: /proxy/network):
 *   GET /proxy/network/api/s/{site}/stat/health   → WAN status + throughput
 *   GET /proxy/network/api/s/{site}/stat/sysinfo  → uptime, firmware version
 *   GET /proxy/network/api/s/{site}/stat/sta      → connected clients
 *
 * All three are fetched in parallel. If all fail we throw (SSE broadcasts
 * unavailable). If some fail we return whatever we have — the widget
 * shows partial data gracefully.
 */

import { PluginInstance, PluginAdapter } from '../types';
import { UnifiAdapter } from './adapter';
import logger from '../../utils/logger';

export const intervalMs = 30_000;

// ── Data shapes (must match UnifiWidget.tsx) ──────────────────────────────────

export interface UnifiWan {
    up: boolean;
    status: string;
    rxBytesPerSec: number;
    txBytesPerSec: number;
    latency: number | null;
    ip: string | null;
    isp: string | null;
}

export interface UnifiClient {
    hostname: string;
    ip: string | null;
    mac: string;
    rxBytes: number;
    txBytes: number;
    isWired: boolean;
}

export interface UnifiData {
    wan: UnifiWan;
    uptime: number;
    fwVersion: string | null;
    topClients: UnifiClient[];
}

// ── Poll ──────────────────────────────────────────────────────────────────────

export async function poll(instance: PluginInstance, adapter: PluginAdapter): Promise<UnifiData> {
    const unifi = adapter as UnifiAdapter;
    const site = (instance.config.site as string) || 'default';
    const base = `/proxy/network/api/s/${site}`;

    const [healthRes, sysinfoRes, clientsRes] = await Promise.allSettled([
        unifi.get!(instance, `${base}/stat/health`,  { timeout: 12_000 }),
        unifi.get!(instance, `${base}/stat/sysinfo`, { timeout: 12_000 }),
        unifi.get!(instance, `${base}/stat/sta`,     { timeout: 12_000 }),
    ]);

    // All endpoints failed → let SSE mark as unavailable
    if ([healthRes, sysinfoRes, clientsRes].every(r => r.status === 'rejected')) {
        logger.warn(`[Poller:unifi] All endpoints failed for ${instance.id}`);
        throw new Error('All UniFi API endpoints unreachable');
    }

    // ── WAN ───────────────────────────────────────────────────────────────────
    let wan: UnifiWan = { up: false, status: 'unknown', rxBytesPerSec: 0, txBytesPerSec: 0, latency: null, ip: null, isp: null };

    if (healthRes.status === 'fulfilled') {
        const wanSub = (healthRes.value.data?.data ?? []).find(
            (s: Record<string, unknown>) => s.subsystem === 'wan' || s.subsystem === 'wan2'
        );
        if (wanSub) {
            wan = {
                up:            wanSub.status === 'ok',
                status:        wanSub.status    ?? 'unknown',
                // rx_bytes_r / tx_bytes_r = real-time bytes/sec on UCG hardware
                rxBytesPerSec: wanSub.rx_bytes_r ?? wanSub.rx_bytes_rate ?? 0,
                txBytesPerSec: wanSub.tx_bytes_r ?? wanSub.tx_bytes_rate ?? 0,
                latency:       wanSub.latency   ?? null,
                ip:            wanSub.wan_ip    ?? null,
                isp:           wanSub.isp_name  ?? null,
            };
        }
    } else {
        logger.debug(`[Poller:unifi] health failed: ${(healthRes as PromiseRejectedResult).reason?.message}`);
    }

    // ── Sysinfo ───────────────────────────────────────────────────────────────
    let uptime = 0;
    let fwVersion: string | null = null;

    if (sysinfoRes.status === 'fulfilled') {
        const sys = sysinfoRes.value.data?.data?.[0] ?? {};
        uptime    = sys.uptime  ?? 0;
        fwVersion = sys.version ?? null;
    } else {
        logger.debug(`[Poller:unifi] sysinfo failed: ${(sysinfoRes as PromiseRejectedResult).reason?.message}`);
    }

    // ── Top 5 clients ─────────────────────────────────────────────────────────
    let topClients: UnifiClient[] = [];

    if (clientsRes.status === 'fulfilled') {
        const raw: Array<Record<string, unknown>> = clientsRes.value.data?.data ?? [];
        topClients = raw
            .filter(c => typeof c.rx_bytes === 'number' || typeof c.tx_bytes === 'number')
            .map(c => ({
                hostname: (c.hostname ?? c.name ?? c.mac ?? 'Unknown') as string,
                ip:       (c.ip  ?? null) as string | null,
                mac:      (c.mac ?? '')   as string,
                rxBytes:  (c.rx_bytes ?? 0) as number,
                txBytes:  (c.tx_bytes ?? 0) as number,
                isWired:  (c.is_wired  ?? false) as boolean,
            }))
            .sort((a, b) => (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes))
            .slice(0, 5);
    } else {
        logger.debug(`[Poller:unifi] clients failed: ${(clientsRes as PromiseRejectedResult).reason?.message}`);
    }

    return { wan, uptime, fwVersion, topClients };
}
