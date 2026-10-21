// WRITTEN BY THE DEVELOPER. `rule nif-unique`: asks the database. `People` is the app's own repository.
package app.rules;

import app.contracts.Shared.NifUnique;
import app.data.People;

public final class NifUniqueRule implements NifUnique {
    private final People people;

    public NifUniqueRule(People people) {
        this.people = people;
    }

    @Override
    public boolean check(String value) {
        return !people.hasNif(value);
    }
}
