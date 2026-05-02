package com.example.ishaqcargo;

import android.view.View;
import android.widget.AdapterView;

public class SimpleItemSelectedListener implements AdapterView.OnItemSelectedListener {

    private final Runnable onChange;

    public SimpleItemSelectedListener(Runnable onChange) {
        this.onChange = onChange;
    }

    @Override
    public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
        if (onChange != null) {
            onChange.run();
        }
    }

    @Override
    public void onNothingSelected(AdapterView<?> parent) {
        if (onChange != null) {
            onChange.run();
        }
    }
}
