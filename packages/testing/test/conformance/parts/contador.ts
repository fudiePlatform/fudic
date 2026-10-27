// A store of the project (SDD-61 §3.9): what the server evaluates of it is its initial value.
import { computed, signal } from '@fudic/core';

export const count = signal(3);
export const triple = computed(() => count() * 3);
