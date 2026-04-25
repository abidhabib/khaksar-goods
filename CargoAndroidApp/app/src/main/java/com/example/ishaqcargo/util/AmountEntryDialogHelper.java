package com.example.ishaqcargo.util;

import android.app.Dialog;
import android.content.Context;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.DrawableRes;
import androidx.annotation.NonNull;

import com.example.ishaqcargo.R;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.textfield.TextInputEditText;

public final class AmountEntryDialogHelper {

    public interface OnAmountSavedListener {
        void onSaved(@NonNull String amount);
    }

    private AmountEntryDialogHelper() {
    }

    public static void show(
            @NonNull Context context,
            @DrawableRes int iconRes,
            @NonNull String title,
            String initialAmount,
            @NonNull OnAmountSavedListener listener
    ) {
        View view = LayoutInflater.from(context).inflate(R.layout.dialog_amount_entry, null, false);
        ImageView iconView = view.findViewById(R.id.dialogIcon);
        TextView titleView = view.findViewById(R.id.dialogTitle);
        TextInputEditText amountInput = view.findViewById(R.id.dialogAmountInput);

        iconView.setImageResource(iconRes);
        titleView.setText(title);
        amountInput.setText(initialAmount == null ? "" : initialAmount);
        amountInput.setSelection(amountInput.getText() != null ? amountInput.getText().length() : 0);

        Dialog dialog = new MaterialAlertDialogBuilder(context)
                .setView(view)
                .setNegativeButton(R.string.close, null)
                .setPositiveButton(R.string.save_amount, null)
                .create();

        dialog.setOnShowListener(ignored -> {
            MaterialButton positiveButton = (MaterialButton) dialog.findViewById(android.R.id.button1);
            if (positiveButton != null) {
                positiveButton.setOnClickListener(v -> {
                    String amount = amountInput.getText() != null ? amountInput.getText().toString().trim() : "";
                    if (TextUtils.isEmpty(amount)) {
                        amountInput.setError(context.getString(R.string.enter_expense_amount));
                        return;
                    }

                    listener.onSaved(amount);
                    dialog.dismiss();
                });
            }

            amountInput.requestFocus();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
            }
        });

        dialog.show();
    }
}
