/**
 * UniFi Widget Plugin
 *
 * Auto-discovered by src/widgets/registry.ts via import.meta.glob.
 * No manual registration needed — just dropping this folder in is enough.
 */

import { lazy } from 'react';
import { Wifi } from 'lucide-react';
import type { WidgetPlugin } from '../types';

export const plugin: WidgetPlugin = {
    id:          'unifi',
    name:        'UniFi',
    description: 'WAN status, throughput, uptime, and top clients from your UniFi OS console',
    category:    'system',
    icon:        Wifi,
    sizing: {
        default: { w: 6, h: 8 },
        min:     { w: 4, h: 5 },
        max:     { w: 24, h: 20 },
    },
    component:               lazy(() => import('./UnifiWidget')),
    compatibleIntegrations:  ['unifi'],
    configConstraints: {
        contentPadding: 'none',
    },
};
