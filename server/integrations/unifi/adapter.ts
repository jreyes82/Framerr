/**
 * UniFi Integration — Adapter
 *
 * UniFi OS consoles use cookie-based session auth:
 *   POST /api/auth/login  →  TOKEN cookie in Set-Cookie
 *   All subsequent requests send that cookie.
 *
 * We cache cookies per-instance (25 min TTL) and invalidate on 401.
 * All requests go through the shared httpsAgent which accepts
 * self-signed certs — standard for homelab UniFi consoles.
 */

import axios from 'axios';
import { BaseAdapter } from '../BaseAdapter';
import { PluginInstance, TestResult } from '../types';
import { HttpOpts } from '../httpTypes';
import { AxiosResponse } from 'axios';
import { httpsAgent } from '../../utils/httpsAgent';
import { AdapterError, extractAdapterErrorMessage } from '../errors';
import logger from '../../utils/logger';

// ── Session cache ─────────────────────────────────────────────────────────────

interface Session { cookie: string; expiresAt: number; }
const sessionCache = new Map<string, Session>();
const SESSION_TTL_MS = 25 * 60 * 1000; // 25 min

// ── Adapter ───────────────────────────────────────────────────────────────────

export class UnifiAdapter extends BaseAdapter {
    // Required by abstract class — used by default testConnection().
    // We override testConnection() below so this value is never called directly.
    readonly testEndpoint = '/api/self';

    getBaseUrl(instance: PluginInstance): string {
        return (instance.config.url as string).replace(/\/$/, '');
    }

    validateConfig(instance: PluginInstance): boolean {
        return !!(instance.config.url && instance.config.username && instance.config.password);
    }

    /** Injects the cached session cookie. Called by BaseAdapter.request(). */
    getAuthHeaders(instance: PluginInstance): Record<string, string> {
        const session = sessionCache.get(instance.id);
        if (!session) return {};
        return { Cookie: session.cookie };
    }

    // ── Session management ────────────────────────────────────────────────────

    async ensureSession(instance: PluginInstance): Promise<void> {
        const cached = sessionCache.get(instance.id);
        if (cached && cached.expiresAt > Date.now()) return;

        const baseUrl = this.getBaseUrl(instance);
        const username = instance.config.username as string;
        const password = instance.config.password as string;

        logger.debug(`[Adapter:unifi] Authenticating instance ${instance.id}`);

        const res = await axios.post(
            `${baseUrl}/api/auth/login`,
            { username, password },
            {
                headers: { 'Content-Type': 'application/json' },
                httpsAgent,
                timeout: 10_000,
                validateStatus: () => true, // handle status manually
            }
        );

        if (res.status === 400 || res.status === 401) {
            throw new AdapterError(
                'AUTH_FAILED',
                'UniFi login failed — wrong username or password. Make sure this is a Local Access account, not a UI.com cloud account.',
                { status: res.status }
            );
        }
        if (res.status !== 200) {
            throw new AdapterError(
                'SERVICE_ERROR',
                `UniFi login returned HTTP ${res.status}`,
                { status: res.status }
            );
        }

        const setCookie = res.headers['set-cookie'];
        if (!setCookie?.length) {
            throw new AdapterError('AUTH_FAILED', 'UniFi login succeeded but no session cookie was returned');
        }

        const cookie = setCookie.map((c: string) => c.split(';')[0]).join('; ');
        sessionCache.set(instance.id, { cookie, expiresAt: Date.now() + SESSION_TTL_MS });
        logger.debug(`[Adapter:unifi] Session cached for ${instance.id}`);
    }

    invalidateSession(instanceId: string): void {
        sessionCache.delete(instanceId);
    }

    // ── Override get() to ensure session first ────────────────────────────────

    async get(instance: PluginInstance, path: string, opts?: HttpOpts): Promise<AxiosResponse> {
        await this.ensureSession(instance);
        try {
            return await super.get(instance, path, opts);
        } catch (err) {
            if (err instanceof AdapterError && (err.context?.status as number) === 401) {
                this.invalidateSession(instance.id);
            }
            throw err;
        }
    }

    // ── Test connection ───────────────────────────────────────────────────────

    async testConnection(config: Record<string, unknown>): Promise<TestResult> {
        const tempInstance: PluginInstance = {
            id: `unifi-test-${Date.now()}`,
            type: 'unifi',
            name: 'Test',
            config,
        };

        try {
            await this.ensureSession(tempInstance);
            const site = (config.site as string) || 'default';
            const res = await this.get(
                tempInstance,
                `/proxy/network/api/s/${site}/stat/sysinfo`,
                { timeout: 8_000 }
            );
            const sysinfo = res.data?.data?.[0];
            return {
                success: true,
                message: 'Connected to UniFi OS console',
                version: sysinfo?.version as string | undefined,
            };
        } catch (err) {
            if (err instanceof AdapterError) return { success: false, error: err.message };
            return { success: false, error: extractAdapterErrorMessage(err) };
        } finally {
            this.invalidateSession(tempInstance.id);
        }
    }
}
