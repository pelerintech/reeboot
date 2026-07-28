import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import FormWidget from '../FormWidget';

describe('FormWidget', () => {
  const sampleFields = [
    { name: 'name', label: 'Company name', type: 'text' as const },
    { name: 'type', label: 'Company type', type: 'select' as const, options: ['Tech', 'Finance'] },
    { name: 'employees', label: 'Employees', type: 'number' as const },
  ];

  it('renders text input, select dropdown, and number input with labels', () => {
    render(<FormWidget fields={sampleFields} onAction={vi.fn()} />);
    expect(screen.getByText('Company name')).toBeInTheDocument();
    expect(screen.getByText('Company type')).toBeInTheDocument();
    expect(screen.getByText('Employees')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Company name' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Company type' })).toBeInTheDocument();
    // Number input role is 'spinbutton'
    const numberInput = screen.getByRole('spinbutton', { name: 'Employees' });
    expect(numberInput).toBeInTheDocument();
  });

  it('calls onAction with form data on submit', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<FormWidget fields={sampleFields} onAction={onAction} />);

    await user.type(screen.getByRole('textbox', { name: 'Company name' }), 'Acme');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Company type' }), 'Tech');
    await user.type(screen.getByRole('spinbutton', { name: 'Employees' }), '50');

    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(onAction).toHaveBeenCalledWith({
      action: 'form_submit',
      fields: { name: 'Acme', type: 'Tech', employees: 50 },
    });
  });

  it('disables submit button when required text field is empty', () => {
    render(<FormWidget fields={sampleFields} onAction={vi.fn()} />);
    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeDisabled();
  });
});
