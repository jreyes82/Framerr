/**
 * UniFi Integration Plugin
 *
 * Registers the UniFi OS Console as a native Framerr integration.
 * Shows up in Settings → Integrations → + Add Integration → UniFi.
 */

import { IntegrationPlugin } from '../types';
import { id, name, description, category, icon, configSchema } from './config';
import { UnifiAdapter } from './adapter';
import * as poller from './poller';

const adapter = new UnifiAdapter();

export const plugin: IntegrationPlugin = {
    id,
    name,
    description,
    category,
    icon,
    configSchema,
    adapter,
    testConnection: adapter.testConnection.bind(adapter),
    poller: {
        intervalMs: poller.intervalMs,
        poll:       poller.poll,
    },
};
