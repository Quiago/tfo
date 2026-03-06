
export const ChartDefs = () => (
    <defs>
        {/* Sensor Gradients */}
        <linearGradient id="gradient-vibration" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#A091FF" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#3C2BAC" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="gradient-temperature" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FFA291" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#AC582B" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="gradient-pressure" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#93FF91" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#3C2BAC" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="gradient-humidity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#81E8FF" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#3C2BAC" stopOpacity={0} />
        </linearGradient>

        {/* Energy Gradients - Matches #fbbf24 (Amber/Yellow) */}
        <linearGradient id="gradient-power" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#b45309" stopOpacity={0} />
        </linearGradient>
        {/* Cooling - Matches #fb923c (Orange) */}
        <linearGradient id="gradient-cooling" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#fb923c" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
        </linearGradient>

        {/* Product Gradients - Matches #a78bfa (Violet) */}
        <linearGradient id="gradient-product" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="gradient-uptime" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
        </linearGradient>

        {/* Filters for Glow Effect */}
        <filter id="neon-glow" height="300%" width="300%" x="-75%" y="-75%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
            <feFlood floodColor="currentColor" floodOpacity="0.5" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="shadow" />
            <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>

        <filter id="neon-glow-strong" height="300%" width="300%" x="-75%" y="-75%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur" />
            <feFlood floodColor="white" floodOpacity="0.8" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="shadow" />
            <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
    </defs>
);
