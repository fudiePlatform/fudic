import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** More than one `<style>` in a component's `<head>` fragment (SDD-10). */
export const FUD0159 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0159', 'error', 'A component <head> fragment holds at most one <style>', p);
