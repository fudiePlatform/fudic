// WRITTEN BY THE DEVELOPER. The handler of `save`: what was inside `.handle(...)` in user-form.fud.
// When it runs, `person` already passed every rule: the NIF letter and that nobody has it.
package app.components;

import app.contracts.UserFormContract.PersonForm;
import app.contracts.UserFormContract.SaveCtx;
import app.contracts.UserFormContract.SaveFails;
import app.contracts.UserFormContract.Saved;
import app.contracts.UserFormContract.UserForm;
import app.data.People;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class UserFormComponent implements UserForm {
    private static final Logger log = LoggerFactory.getLogger(UserFormComponent.class);

    private final People people;

    public UserFormComponent(People people) {
        this.people = people;
    }

    @Override
    public Saved save(SaveCtx ctx, PersonForm person) {
        // A 409: the form keeps it (its `catches`) and paints it in the summary.
        if (person.name().strip().toLowerCase(Locale.ROOT).equals("admin")) throw SaveFails.reserved();
        log.info("[user-form] {} da de alta a {}", ctx.user().name(), person.name());
        return people.add(person);
    }
}
