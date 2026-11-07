import { cn } from 'cn';
import { CornerDownLeftIcon, Loader2Icon, SquareIcon, XIcon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes, KeyboardEventHandler } from 'react';
import { useState } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export type PromptInputMessage = {
  text: string;
};

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
};

export const PromptInput = ({ className, onSubmit, children, ...props }: PromptInputProps) => (
  <form
    className={cn('w-full', className)}
    onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const text = (new FormData(form).get('message') as string | null) ?? '';
      // Read before the reset, so a controlled parent can clear its draft in the same tick.
      form.reset();
      onSubmit({ text });
    }}
    {...props}
  >
    <InputGroup className="overflow-hidden">{children}</InputGroup>
  </form>
);

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
  <div className={cn('contents', className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
  onChange,
  className,
  placeholder = 'What would you like to know?',
  ...props
}: PromptInputTextareaProps) => {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key !== 'Enter' || isComposing || event.nativeEvent.isComposing) {
      return;
    }
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();

    // A disabled submit button means "nothing to send yet"; Enter does nothing.
    const form = event.currentTarget.form;
    const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitButton?.disabled) {
      return;
    }
    form?.requestSubmit();
  };

  return (
    <InputGroupTextarea
      className={cn('field-sizing-content max-h-48 min-h-16', className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      onChange={onChange}
      placeholder={placeholder}
      {...props}
    />
  );
};

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, 'align'>;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn('justify-between gap-1', className)}
    {...props}
  />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props} />
);

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
};

export const PromptInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon-sm',
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let Icon = <CornerDownLeftIcon className="size-4" />;

  if (status === 'submitted') {
    Icon = <Loader2Icon className="size-4 animate-spin" />;
  } else if (status === 'streaming') {
    Icon = <SquareIcon className="size-4" />;
  } else if (status === 'error') {
    Icon = <XIcon className="size-4" />;
  }

  return (
    <InputGroupButton
      aria-label="发送"
      className={cn(className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};
