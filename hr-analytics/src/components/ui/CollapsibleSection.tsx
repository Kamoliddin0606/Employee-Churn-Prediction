/**
 * =============================================================================
 * Collapsible Section Component
 * =============================================================================
 * 
 * A reusable component for collapsible content sections.
 * Used to hide/show header content above tables.
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    className?: string;
}

export function CollapsibleSection({
    title,
    defaultOpen = true,
    children,
    className = ''
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`border rounded-lg bg-card ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm">{title}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                    {isOpen ? 'Yashirish' : 'Ko\'rsatish'}
                </span>
            </button>
            
            {isOpen && (
                <div className="px-4 pb-4 border-t">
                    {children}
                </div>
            )}
        </div>
    );
}

export default CollapsibleSection;
