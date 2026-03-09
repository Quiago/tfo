import { AlertTriangle, ClipboardPlus, Maximize2, X } from 'lucide-react'
import { AnomalyAlert } from './MachineInspector'
import styles from '../../styles/overview/MachineOverlay.module.css'

interface MachineOverlayProps {
    title: string
    meshName: string
    anomaly?: AnomalyAlert | null
    onClose: () => void
    onCreateWorkOrder?: (meshName: string) => void
    onExpand?: (meshName: string, isAnomaly: boolean) => void
}

export function MachineOverlay({
    title,
    meshName,
    anomaly,
    onClose,
    onCreateWorkOrder,
    onExpand,
}: MachineOverlayProps) {
    return (
        <div className={styles.overlayContainer}>
            <div className={styles.gradientBackground} />

            <div className={styles.content}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h3 className={styles.machineTitle}>{title}</h3>
                        <span className={styles.machineId}>{meshName}</span>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}>
                        <X size={18} />
                    </button>
                </div>

                {/* Data Row - Mimicking the SVG layout with 4 metrics */}
                <div className={styles.dataRow}>
                    <div className={styles.dataItem}>
                        <span className={styles.dataLabel}>Efficiency</span>
                        <div className={styles.dataValueContainer}>
                            <div className={`${styles.dataDot} ${styles.dotGreen}`} />
                            <span className={styles.dataValue}>98%</span>
                        </div>
                    </div>
                    <div className={styles.dataItem}>
                        <span className={styles.dataLabel}>Load</span>
                        <div className={styles.dataValueContainer}>
                            <div className={`${styles.dataDot} ${styles.dotPurple}`} />
                            <span className={styles.dataValue}>42%</span>
                        </div>
                    </div>
                    <div className={styles.dataItem}>
                        <span className={styles.dataLabel}>Temp</span>
                        <div className={styles.dataValueContainer}>
                            <div className={`${styles.dataDot} ${styles.dotMagenta}`} />
                            <span className={styles.dataValue}>65°C</span>
                        </div>
                    </div>
                    <div className={styles.dataItem}>
                        <span className={styles.dataLabel}>Power</span>
                        <div className={styles.dataValueContainer}>
                            <div className={`${styles.dataDot} ${styles.dotBlue}`} />
                            <span className={styles.dataValue}>12A</span>
                        </div>
                    </div>
                </div>

                {/* Anomaly Alert */}
                {anomaly && (
                    <div className={styles.anomalyContainer}>
                        <div className={styles.anomalyHeader}>
                            <AlertTriangle size={16} className="text-red-400" />
                            <span className={styles.anomalyTitle}>{anomaly.type}</span>
                        </div>
                        <p className={styles.anomalyText}>{anomaly.message}</p>
                    </div>
                )}

                {/* Actions */}
                <div className={styles.actions}>
                    <button
                        onClick={() => onCreateWorkOrder?.(meshName)}
                        className={`${styles.actionBtn} ${styles.btnCreate}`}
                    >
                        <div className={styles.actionIconWrapper}>
                            <ClipboardPlus size={16} />
                        </div>
                        <span className={styles.btnLabel}>Create Order</span>
                    </button>

                    <button
                        onClick={() => onExpand?.(meshName, !!anomaly)}
                        className={`${styles.actionBtn} ${styles.btnExpand}`}
                    >
                        <div className={styles.actionIconWrapper}>
                            <Maximize2 size={16} />
                        </div>
                        <span className={styles.btnLabel}>Expand View</span>
                    </button>
                </div>
            </div>

            <div className={styles.pointer} />
        </div>
    )
}
