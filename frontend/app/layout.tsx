import '@/styles/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'TRIPOLAR - Industrial Digital Twin Platform',
    description: 'Real-time monitoring and predictive analytics for industrial systems',
};

import { AiChatBubble } from '@/components/ui/AiChatBubble';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>
                {children}
                <AiChatBubble />
            </body>
        </html>
    );
}
