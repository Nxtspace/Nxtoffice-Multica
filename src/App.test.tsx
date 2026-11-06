// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App 骨架', () => {
  it('渲染标题与双视图落位', () => {
    render(<App />);
    expect(screen.getByText('Nxtoffice')).toBeTruthy();
    expect(screen.getByTestId('view-slot')).toBeTruthy();
    expect(screen.getByLabelText('2D 等距视图')).toBeTruthy();
    expect(screen.getByLabelText('3D 沉浸视图')).toBeTruthy();
  });
});
