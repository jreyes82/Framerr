/**
 * UniFi Widget
 *
 * Displays live data from a UniFi OS Console via SSE:
 *   - WAN online / offline status
 *   - Real-time download & upload throughput
 *   - Gateway uptime + firmware version
 *   - Top 5 clients by total data usage
 *
 * Follows the exact same pattern as TautulliWidget:
 *   useWidgetIntegration → useIntegrationSSE → render guards → content
 */

import React, { useState } from 'react';
import { Wifi, ArrowDown, ArrowUp, Clock, Globe, Activity, Users } from 'lucide-react';
import { WidgetStateMessage } from '../../shared/widgets';
import { useWidgetIntegration } from '../../shared/widgets/hooks/useWidgetIntegration';
import { useIntegrationSSE } from '../../shared/widgets/hooks/useIntegrationSSE';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../utils/permissions';
import type { WidgetProps } from '../types';
import './styles.css';

// ── Types (must match poller.ts) ──────────────────────────────────────────────

interface UnifiWan {
    up: boolean;
    status: string;
    rxBytesPerSec: number;
    txBytesPerSec: number;
    latency: number | null;
    ip: string | null;
    isp: string | null;
}

interface UnifiClient {
    hostname: string;
    ip: string | null;
    mac: string;
    rxBytes: number;
    txBytes: number;
    isWired: boolean;
}

interface UnifiData {
    wan: UnifiWan;
    uptime: number;
    fwVersion: string | null;
    topClients: UnifiClient[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number, dec = 1): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dec))} ${units[i]}`;
}

function fmtBps(bps: number): string { return `${fmtBytes(bps)}/s`; }

function fmtUptime(s: number): string {
    if (!s) return '—';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ClientRow({ client, rank }: { client: UnifiClient; rank: number }) {
    return (
        <div className="unifi-client-row">
            <span className="unifi-client-rank">{rank}</span>
            <div className="unifi-client-info">
                <p className="unifi-client-host">{client.hostname}</p>
                {client.ip && <p className="unifi-client-ip">{client.ip}</p>}
            </div>
            <div className="unifi-client-bytes">
                <p className="unifi-client-total">{fmtBytes(client.rxBytes + client.txBytes)}</p>
                <p className="unifi-client-detail">
                    <span className="unifi-down-color">↓</span>{fmtBytes(client.rxBytes)}{' '}
                    <span className="unifi-up-color">↑</span>{fmtBytes(client.txBytes)}
                </p>
            </div>
            <span className={`unifi-badge ${client.isWired ? 'unifi-badge--eth' : 'unifi-badge--wifi'}`}>
                {client.isWired ? 'ETH' : 'WiFi'}
            </span>
        </div>
    );
}

// ── Widget ────────────────────────────────────────────────────────────────────

export default function UnifiWidget({ widget }: WidgetProps) {
    const { user } = useAuth();
    const userIsAdmin = isAdmin(user);

    const configuredIntegrationId = widget.config?.integrationId as string | undefined;

    const {
        effectiveIntegrationId,
        effectiveDisplayName,
        status: accessStatus,
        loading: accessLoading,
    } = useWidgetIntegration('unifi', configuredIntegrationId, widget.id);

    const integrationId = effectiveIntegrationId ?? undefined;
    const isBound = !!integrationId;

    const [data, setData]   = useState<UnifiData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { loading, isConnected } = useIntegrationSSE<UnifiData>({
        integrationType: 'unifi',
        integrationId,
        enabled: isBound,
        onData:  (d) => { setData(d); setError(null); },
        onError: (e) => setError(e.message),
    });

    // ── Render guards (same order as TautulliWidget) ──────────────────────────
    if (accessLoading) return <WidgetStateMessage variant="loading" />;
    if (accessStatus === 'noAccess')     return <WidgetStateMessage variant="noAccess"     serviceName="UniFi" />;
    if (accessStatus === 'disabled')     return <WidgetStateMessage variant="disabled"     serviceName="UniFi" isAdmin={userIsAdmin} />;
    if (accessStatus === 'notConfigured' || !isBound)
                                         return <WidgetStateMessage variant="notConfigured" serviceName="UniFi" isAdmin={userIsAdmin} />;
    if ((loading && !data) || (!isConnected && !data))
                                         return <WidgetStateMessage variant="loading" />;
    if (error) {
        const unavail = error.includes('unavailable') || error.includes('unreachable');
        return <WidgetStateMessage
            variant={unavail ? 'unavailable' : 'error'}
            serviceName="UniFi"
            instanceName={unavail ? effectiveDisplayName : undefined}
            message={unavail ? undefined : error}
        />;
    }
    if (!data) return <WidgetStateMessage variant="loading" />;

    const { wan, uptime, fwVersion, topClients } = data;

    // ── Content ───────────────────────────────────────────────────────────────
    return (
        <div className="unifi-widget">

            {/* WAN status pill */}
            <div className={`unifi-wan-pill ${wan.up ? 'unifi-wan-pill--up' : 'unifi-wan-pill--down'}`}>
                <span className={`unifi-dot ${wan.up ? 'unifi-dot--up' : 'unifi-dot--down'}`} />
                <span className={`unifi-wan-label ${wan.up ? 'unifi-wan-label--up' : 'unifi-wan-label--down'}`}>
                    WAN {wan.up ? 'Online' : 'Offline'}
                </span>
                {wan.ip && <span className="unifi-wan-ip">{wan.ip}</span>}
            </div>

            {/* Throughput */}
            <div className="unifi-tp-grid">
                <div className="unifi-tp-card">
                    <ArrowDown size={14} className="unifi-down-color" />
                    <div>
                        <p className="unifi-tp-label">Download</p>
                        <p className="unifi-tp-val unifi-down-color">{fmtBps(wan.rxBytesPerSec)}</p>
                    </div>
                </div>
                <div className="unifi-tp-card">
                    <ArrowUp size={14} className="unifi-up-color" />
                    <div>
                        <p className="unifi-tp-label">Upload</p>
                        <p className="unifi-tp-val unifi-up-color">{fmtBps(wan.txBytesPerSec)}</p>
                    </div>
                </div>
            </div>

            {/* Meta row */}
            <div className="unifi-meta-row">
                <div className="unifi-meta-item">
                    <Clock size={11} className="unifi-meta-icon" />
                    <span className="unifi-meta-label">Uptime</span>
                    <span className="unifi-meta-value">{fmtUptime(uptime)}</span>
                </div>
                {wan.isp && (
                    <div className="unifi-meta-item">
                        <Globe size={11} className="unifi-meta-icon" />
                        <span className="unifi-meta-label">ISP</span>
                        <span className="unifi-meta-value">{wan.isp}</span>
                    </div>
                )}
                {wan.latency != null && (
                    <div className="unifi-meta-item">
                        <Activity size={11} className="unifi-meta-icon" />
                        <span className="unifi-meta-label">Latency</span>
                        <span className="unifi-meta-value">{wan.latency} ms</span>
                    </div>
                )}
                {fwVersion && (
                    <div className="unifi-meta-item">
                        <span className="unifi-meta-label">FW</span>
                        <span className="unifi-meta-value unifi-meta-mono">{fwVersion}</span>
                    </div>
                )}
            </div>

            {/* Top clients */}
            {topClients.length > 0 && (
                <div className="unifi-clients">
                    <div className="unifi-section-header">
                        <Users size={11} className="unifi-meta-icon" />
                        <span className="unifi-section-title">Top Clients</span>
                    </div>
                    {topClients.map((c, i) => (
                        <ClientRow key={c.mac || i} client={c} rank={i + 1} />
                    ))}
                </div>
            )}

        </div>
    );
}
