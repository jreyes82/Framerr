import { ConfigSchema, IntegrationCategory } from '../types';

export const id = 'unifi';
export const name = 'UniFi';
export const description = 'UniFi OS Console — WAN status, throughput, uptime, and top clients';
export const category: IntegrationCategory = 'system';
export const icon = 'system:unifi'; // unifi.png already exists in server/assets/system-icons/

export const configSchema: ConfigSchema = {
    fields: [
        {
            key: 'url',
            type: 'url',
            label: 'Console URL',
            placeholder: 'https://192.168.1.1',
            hint: 'The LAN IP of your UniFi OS console (UCG-Fiber, UDM, etc.)',
            required: true,
        },
        {
            key: 'username',
            type: 'text',
            sensitive: true,
            label: 'Local Admin Username',
            placeholder: 'framerr-ro',
            hint: 'Must be a Local Access account — not your UI.com cloud account',
            required: true,
        },
        {
            key: 'password',
            type: 'password',
            sensitive: true,
            label: 'Password',
            placeholder: '••••••••',
            required: true,
        },
        {
            key: 'site',
            type: 'text',
            label: 'Site Name',
            placeholder: 'default',
            hint: 'Leave blank unless you have multiple sites. Find it in Network → Settings → Site.',
            required: false,
        },
    ],
    infoMessage: {
        icon: 'info',
        title: 'Local Access account required',
        content:
            'Create a dedicated local admin on your console (OS Settings → Admins → Add). ' +
            'Set Account Type to "Local Access Only" — cloud accounts require MFA which breaks API access. ' +
            'View Only role is enough for read-only stats.',
    },
};
