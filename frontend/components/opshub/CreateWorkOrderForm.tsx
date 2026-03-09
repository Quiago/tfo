'use client'

import { MOCK_TEAM } from '@/lib/hooks/useOpshubMockData'
import type { TaskPriority } from '@/lib/types/opshub'
import { ArrowLeft, ClipboardPlus, User, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import styles from '../../styles/opshub/work-orders.module.css'

export interface WorkOrderFormData {
    title: string
    description: string
    equipmentName: string
    priority: TaskPriority
    facility: string
    tags: string[]
}

export interface TaskAssignmentData {
    assigneeId: string
    instructions: string
}

interface CreateWorkOrderFormProps {
    initialData?: Partial<WorkOrderFormData> // NEW: Auto-fill data
    prefillEquipment?: string
    onSubmit: (woData: WorkOrderFormData, taskData: TaskAssignmentData) => void
    onCancel: () => void
}

const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-zinc-600' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-500' },
    { value: 'high', label: 'High', color: 'bg-amber-500' },
    { value: 'critical', label: 'Critical', color: 'bg-red-500' },
]

const FACILITIES = [
    'Munich Paint Shop',
    'Detroit Assembly',
    'Shenzhen Electronics',
    'CDMX Stamping',
    'Riyadh Cooling Systems',
    'Tokyo Innovation Lab',
    'São Paulo Hub',
]

export function CreateWorkOrderForm({ initialData, prefillEquipment, onSubmit, onCancel }: CreateWorkOrderFormProps) {
    // Section 1: Work Order Details
    const [title, setTitle] = useState(initialData?.title || (prefillEquipment ? `Maintenance — ${prefillEquipment}` : ''))
    const [description, setDescription] = useState(initialData?.description || '')
    const [equipmentName, setEquipmentName] = useState(initialData?.equipmentName || prefillEquipment || '')
    const [priority, setPriority] = useState<TaskPriority>(initialData?.priority || 'medium')
    const [facility, setFacility] = useState(initialData?.facility || FACILITIES[0])
    const [tagInput, setTagInput] = useState('')
    const [tags, setTags] = useState<string[]>(initialData?.tags || (prefillEquipment ? ['maintenance'] : []))

    // Section 2: Initial Task Assignment
    const [assigneeId, setAssigneeId] = useState<string>('')
    const [taskInstructions, setTaskInstructions] = useState('Perform physical inspection of the bearing assembly based on the anomaly report.')

    const [errors, setErrors] = useState<Record<string, string>>({})

    // Filter relevant team members (exclude system/AI for assignment if needed, or keep all)
    const availableAssignees = MOCK_TEAM.filter(m => !m.isAI)

    // Select Reliability Engineer by default if available/matching intent
    useEffect(() => {
        // Try to find a Reliability Engineer or Maintenance Lead
        const suggested = availableAssignees.find(m => m.role.includes('Reliability')) || availableAssignees[0]
        if (suggested && !assigneeId) {
            setAssigneeId(suggested.id)
        }
    }, [availableAssignees, assigneeId])


    const addTag = useCallback(() => {
        const tag = tagInput.trim().toLowerCase()
        if (tag && !tags.includes(tag)) {
            setTags((prev) => [...prev, tag])
        }
        setTagInput('')
    }, [tagInput, tags])

    const removeTag = useCallback((tag: string) => {
        setTags((prev) => prev.filter((t) => t !== tag))
    }, [])

    const handleSubmit = useCallback(() => {
        const newErrors: Record<string, string> = {}
        if (!title.trim()) newErrors.title = 'Title is required'
        if (!equipmentName.trim()) newErrors.equipmentName = 'Equipment name is required'
        if (!assigneeId) newErrors.assignee = 'Assignee is required'
        // Description check removed or made optional? User didn't say it's optional, just not auto-filled.
        if (!description.trim()) newErrors.description = 'Description is required'
        if (!taskInstructions.trim()) newErrors.instructions = 'Instructions are required'

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        onSubmit(
            { title: title.trim(), description: description.trim(), equipmentName: equipmentName.trim(), priority, facility, tags },
            { assigneeId, instructions: taskInstructions.trim() }
        )
    }, [title, description, equipmentName, priority, facility, tags, assigneeId, taskInstructions, onSubmit])

    // ... inside CreateWorkOrderForm component ...

    const getPriorityColorClass = (p: string) => {
        switch (p) {
            case 'low': return styles.bgZinc
            case 'medium': return styles.bgBlue
            case 'high': return styles.bgAmber
            case 'critical': return styles.bgRed
            default: return styles.bgZinc
        }
    }

    const getPriorityActiveClass = (p: string) => {
        switch (p) {
            case 'low': return styles.priorityActiveLow
            case 'medium': return styles.priorityActiveMedium
            case 'high': return styles.priorityActiveHigh
            case 'critical': return styles.priorityActiveCritical
            default: return ''
        }
    }

    return (
        <div className={styles.createContainer}>
            {/* Header */}
            <div className={styles.createHeader}>
                <button onClick={onCancel} className={styles.backBtn}>
                    <ArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                    <ClipboardPlus className="w-5 h-5 text-cyan-400" />
                    <h1 className={styles.createTitle}>Create Work Order</h1>
                </div>
            </div>

            {/* Content - Side by Side */}
            <div className={styles.createBody}>

                {/* LEFT: Work Order Context (60%) */}
                <div className={`${styles.createSection} ${styles.createSectionLeft}`}>
                    <div className={`${styles.sectionAccent} ${styles.accentCyan}`}></div>
                    <h2 className={styles.createSectionHeader}>
                        <span className={`${styles.sectionNumber} ${styles.numCyan}`}>1</span>
                        Order Context
                    </h2>

                    <div className={`${styles.formContent} custom-scrollbar`}>
                        {/* Title */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: '' })) }}
                                placeholder="Order Title"
                                className={`${styles.formInput} ${errors.title ? styles.formError : ''}`}
                            />
                            {errors.title && <span className={styles.formErrorText}>{errors.title}</span>}
                        </div>

                        {/* Equipment & Facility */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Equipment</label>
                                <input
                                    type="text"
                                    value={equipmentName}
                                    onChange={(e) => { setEquipmentName(e.target.value); setErrors((p) => ({ ...p, equipmentName: '' })) }}
                                    className={`${styles.formInput} ${errors.equipmentName ? styles.formError : ''}`}
                                />
                                {errors.equipmentName && <span className={styles.formErrorText}>{errors.equipmentName}</span>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Facility</label>
                                <select
                                    value={facility}
                                    onChange={(e) => setFacility(e.target.value)}
                                    className={styles.formSelect}
                                >
                                    {FACILITIES.map((f) => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Priority */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Priority</label>
                            <div className={styles.priorityGroup}>
                                {PRIORITIES.map((p) => (
                                    <button
                                        key={p.value}
                                        onClick={() => setPriority(p.value)}
                                        className={`${styles.priorityBtn} ${priority === p.value ? `${styles.priorityBtnActive} ${getPriorityActiveClass(p.value)}` : ''}`}
                                    >
                                        <span className={`${styles.priorityDot} ${getPriorityColorClass(p.value)}`} />
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: '' })) }}
                                placeholder="Describe the issue..."
                                rows={4}
                                className={`${styles.formTextarea} resize-none ${errors.description ? styles.formError : ''}`}
                            />
                            {errors.description && <span className={styles.formErrorText}>{errors.description}</span>}
                        </div>

                        {/* Tags */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Tags</label>
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                                    placeholder="Add tag..."
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.tagContainer}>
                                {tags.map((tag) => (
                                    <span key={tag} className={styles.tagItem}>
                                        {tag}
                                        <button onClick={() => removeTag(tag)} className={styles.removeTagBtn}>
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Initial Task (40%) */}
                <div className={`${styles.createSection} ${styles.createSectionRight}`}>
                    <div className={`${styles.sectionAccent} ${styles.accentAmber}`}></div>
                    <h2 className={styles.createSectionHeader}>
                        <span className={`${styles.sectionNumber} ${styles.numAmber}`}>2</span>
                        Initial Task
                    </h2>

                    <div className={`${styles.formContent} custom-scrollbar`}>
                        {/* Assignee */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Assign To</label>
                            <div className="relative">
                                <select
                                    value={assigneeId}
                                    onChange={(e) => setAssigneeId(e.target.value)}
                                    className={`${styles.formSelect} appearance-none`}
                                >
                                    <option value="" disabled>Select...</option>
                                    {availableAssignees.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.name} — {m.role}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-3 pointer-events-none text-zinc-500">
                                    <User size={14} />
                                </div>
                            </div>
                            {errors.assignee && <span className={styles.formErrorText}>{errors.assignee}</span>}
                        </div>

                        {/* Instructions */}
                        <div className={`${styles.formGroup} flex-1`}>
                            <label className={styles.formLabel}>Instructions</label>
                            <textarea
                                value={taskInstructions}
                                onChange={(e) => { setTaskInstructions(e.target.value); setErrors((p) => ({ ...p, instructions: '' })) }}
                                placeholder="Task instructions..."
                                className={`${styles.formTextarea} resize-none flex-1 min-h-[120px] ${errors.instructions ? styles.formError : ''}`}
                            />
                            {errors.instructions && <span className={styles.formErrorText}>{errors.instructions}</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className={styles.createActions}>
                <button
                    onClick={onCancel}
                    className={styles.cancelActionBtn}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    className={styles.submitActionBtn}
                >
                    <ClipboardPlus size={14} />
                    Create Order & Assign
                </button>
            </div>
        </div>
    )
}
