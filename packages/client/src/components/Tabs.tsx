import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn, disabledInkClasses } from '~/utils';
import { focusOutlineRole } from './Focus';

const Tabs: React.ForwardRefExoticComponent<
  TabsPrimitive.TabsProps & React.RefAttributes<HTMLDivElement>
> = TabsPrimitive.Root;

const TabsList: React.ForwardRefExoticComponent<
  Omit<TabsPrimitive.TabsListProps & React.RefAttributes<HTMLDivElement>, 'ref'> & {
    variant?: 'default' | 'segmented';
  } & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: 'default' | 'segmented' }
>(({ className = '', variant = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      variant === 'segmented'
        ? 'bg-surface-secondary inline-flex items-center justify-center gap-1 rounded-lg p-1'
        : 'bg-surface-primary inline-flex items-center justify-center rounded-md',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger: React.ForwardRefExoticComponent<
  Omit<TabsPrimitive.TabsTriggerProps & React.RefAttributes<HTMLButtonElement>, 'ref'> & {
    variant?: 'default' | 'segmented';
  } & React.RefAttributes<HTMLButtonElement>
> = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: 'default' | 'segmented';
  }
>(({ className = '', variant = 'default', ...props }, ref) => (
  <TabsPrimitive.Trigger
    className={cn(
      'text-text-secondary data-[state=active]:bg-surface-primary data-[state=active]:text-text-primary rounded-theme-tab min-w-theme-tab inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
      disabledInkClasses,
      focusOutlineRole,
      variant === 'segmented' && 'gap-2 rounded-md data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
    ref={ref}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent: React.ForwardRefExoticComponent<
  Omit<TabsPrimitive.TabsContentProps & React.RefAttributes<HTMLDivElement>, 'ref'> & {
    size?: 'default' | 'flush';
  } & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & { size?: 'default' | 'flush' }
>(({ className = '', size = 'default', ...props }, ref) => (
  <TabsPrimitive.Content
    className={cn('mt-2 rounded-md', size === 'flush' ? 'p-0' : 'p-6', className)}
    {...props}
    ref={ref}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
